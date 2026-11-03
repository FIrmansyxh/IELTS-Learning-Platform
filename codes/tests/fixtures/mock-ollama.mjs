// Server Ollama tiruan untuk menguji scripts/bench-ai.mjs. Tanpa dependensi.
import http from 'node:http';

export function startMockOllama({ delayMs = 0, valid = true } = {}) {
  const goodOutput = {
    criteria: {
      task_response: { band: 6, comment_id: 'Cukup menjawab soal.' },
      coherence: { band: 6, comment_id: 'Alur cukup jelas.' },
      lexical: { band: 6, comment_id: 'Kosakata memadai.' },
      grammar: { band: 6, comment_id: 'Beberapa kesalahan tata bahasa.' },
    },
    overall_band: 6,
    task_requirement_met: true,
    strengths_id: ['Struktur jelas.'],
    improvements_id: ['Perluas contoh.'],
    corrections: [],
    band7_rewrite: '',
  };
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/api/tags') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ models: [] }));
      return;
    }
    if (req.method === 'POST' && req.url === '/api/chat') {
      req.resume();
      req.on('end', () => {
        setTimeout(() => {
          res.setHeader('content-type', 'application/json');
          const content = valid ? JSON.stringify(goodOutput) : '{"bukan":"skema"}';
          res.end(JSON.stringify({ message: { role: 'assistant', content }, done: true }));
        }, delayMs);
      });
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) });
    });
  });
}
