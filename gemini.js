// Прокси для того чтобы добавить впн к google, а то сервер ру
const http = require('http');
const { SocksProxyAgent } = require('socks-proxy-agent');

const PROXY_PORT = 3434;
const SOCKS_PROXY = 'socks5://127.0.0.1:1080';
const agent = new SocksProxyAgent(SOCKS_PROXY);

const server = http.createServer(async (req, res) => {
  // Добавляем CORS заголовки
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
        const requestData = JSON.parse(body);
        console.log('Received request:', JSON.stringify(requestData, null, 2));
        
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

        // Парсим messages если это строка
        let parsedMessages = messages;
        if (typeof messages === 'string') {
          try {
            parsedMessages = JSON.parse(messages);
          } catch (e) {
            console.error('Failed to parse messages string:', messages);
            throw new Error('Invalid messages format');
          }
        }

        // Проверяем что parsedMessages - массив
        if (!Array.isArray(parsedMessages)) {
          console.error('Messages is not an array:', parsedMessages);
          throw new Error('Messages must be an array');
        }

        // Конвертируем messages в формат Gemini
        const contents = parsedMessages.map(msg => ({
          parts: [{ text: msg.content || msg }],
          role: msg.role === 'assistant' ? 'model' : 'user'
        }));

        console.log('Sending to Gemini:', JSON.stringify({ contents }, null, 2));

        // Запрос к Gemini через SOCKS5
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            generationConfig: {
              temperature: parseFloat(temperature) || 0.7,
              maxOutputTokens: parseInt(maxTokens) || 1000,
              topP: 0.95,
              topK: 64
            }
          }),
          agent
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Gemini API error:', response.status, errorText);
          throw new Error(`Gemini API error: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        console.log('Gemini response:', JSON.stringify(data, null, 2));
        
        // Конвертируем ответ в ваш формат
        const geminiText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        const result = {
          choices: [{
            message: {
              content: geminiText,
              role: 'assistant'
            },
            index: 0,
            finish_reason: data.candidates?.[0]?.finishReason || 'stop'
          }],
          usage: data.usageMetadata ? {
            prompt_tokens: data.usageMetadata.promptTokenCount,
            completion_tokens: data.usageMetadata.candidatesTokenCount,
            total_tokens: data.usageMetadata.totalTokenCount
          } : undefined
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        console.error('Proxy error:', error);
        res.writeHead(500);
        res.end(JSON.stringify({ 
          error: error.message,
          details: error.toString()
        }));
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PROXY_PORT, () => {
  console.log(`✅ Gemini proxy running at http://localhost:${PROXY_PORT}`);
  console.log(`🔌 Using SOCKS5 proxy: ${SOCKS_PROXY}`);
});
