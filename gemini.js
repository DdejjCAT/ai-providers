// Прокси для того чтобы добавить впн к google, а то сервер ру
const http = require('http');
const { SocksProxyAgent } = require('socks-proxy-agent');

const PROXY_PORT = 8080;
const SOCKS_PROXY = 'socks5://127.0.0.1:1080';
const agent = new SocksProxyAgent(SOCKS_PROXY);

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/gemini-proxy') {
    let body = '';
    
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const {
          model = 'gemini-3-flash-preview',
          messages,
          maxTokens = 1000,
          temperature = 0.7
        } = JSON.parse(body);

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

        // Конвертируем messages в формат Gemini
        const contents = messages.map(msg => ({
          parts: [{ text: msg.content }],
          role: msg.role === 'assistant' ? 'model' : 'user'
        }));

        // Запрос к Gemini через SOCKS5
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents,
              generationConfig: {
                temperature,
                maxOutputTokens: maxTokens
              }
            }),
            agent
          }
        );

        const data = await response.json();
        
        // Конвертируем ответ в ваш формат
        const result = {
          choices: [{
            message: {
              content: data.candidates?.[0]?.content?.parts?.[0]?.text || ''
            },
            index: 0
          }]
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  }
});

server.listen(PROXY_PORT, () => {
  console.log(`Gemini proxy running at http://localhost:${PROXY_PORT}`);
});
