// Прокси для того чтобы добавить впн к google, а то сервер ру
const http = require('http');
const { SocksProxyAgent } = require('socks-proxy-agent');
const axios = require('axios');

const PROXY_PORT = 3434;
const SOCKS_PROXY = 'socks5://127.0.0.1:1080';

// Создаем агента
const agent = new SocksProxyAgent(SOCKS_PROXY);

// Создаем axios instance с прокси
const axiosWithProxy = axios.create({
  httpsAgent: agent,
  httpAgent: agent,
  proxy: false
});

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/gemini-proxy') {
    let body = '';
    
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        console.log('📥 Request received');
        
        const requestData = JSON.parse(body);
        const {
          model = 'gemini-3-flash-preview',
          messages,
          maxTokens = 1000,
          temperature = 0.7
        } = requestData;

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        
        if (!GEMINI_API_KEY) {
          throw new Error('GEMINI_API_KEY not set');
        }

        // ТЕСТ ПРОКСИ через axios
        try {
          console.log('🔌 Testing SOCKS5 proxy...');
          const testResponse = await axiosWithProxy.get('https://api.ipify.org', {
            timeout: 5000
          });
          const testIp = testResponse.data;
          console.log(`✅ Proxy test - IP: ${testIp}`);
          
          if (testIp !== '45.84.222.42') {
            console.log(`❌ ERROR: Wrong IP! Expected 45.84.222.42, got ${testIp}`);
            throw new Error(`Proxy gives wrong IP: ${testIp}`);
          }
        } catch (e) {
          console.error('❌ Proxy test failed:', e.message);
          throw new Error('SOCKS5 proxy not working: ' + e.message);
        }

        // Парсим messages
        let parsedMessages = messages;
        if (typeof messages === 'string') {
          parsedMessages = JSON.parse(messages);
        }

        // Конвертируем в формат Gemini
        const contents = parsedMessages.map(msg => ({
          parts: [{ text: msg.content || msg }],
          role: msg.role === 'assistant' ? 'model' : 'user'
        }));

        // Отправляем в Gemini через axios с прокси
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
        console.log('📤 Sending to Gemini via SOCKS5 proxy...');
        
        const response = await axiosWithProxy.post(url, {
          contents,
          generationConfig: {
            temperature: parseFloat(temperature) || 0.7,
            maxOutputTokens: parseInt(maxTokens) || 1000,
            topP: 0.95,
            topK: 64
          }
        }, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000
        });

        const data = response.data;
        console.log('✅ Gemini response received');
        
        // Конвертируем ответ
        const result = {
          choices: [{
            message: {
              content: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
              role: 'assistant'
            },
            index: 0,
            finish_reason: data.candidates?.[0]?.finishReason || 'stop'
          }]
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        
      } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
        res.writeHead(500);
        res.end(JSON.stringify({ 
          error: error.response?.data?.error?.message || error.message 
        }));
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PROXY_PORT, '0.0.0.0', () => {
  console.log(`✅ Gemini proxy running at http://0.0.0.0:${PROXY_PORT}`);
  console.log(`🔌 Using SOCKS5 proxy: ${SOCKS_PROXY}`);
});

// Обработка ошибок
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
