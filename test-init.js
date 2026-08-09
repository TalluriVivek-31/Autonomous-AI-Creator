import { spawn } from 'child_process';
import http from 'http';

const server = spawn('node', ['server.js'], { stdio: 'inherit' });

setTimeout(() => {
  const req = http.request('http://localhost:3000/api/agent/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, (res) => {
    let data = '';
    res.on('data', c => data+=c);
    res.on('end', () => {
      console.log('--- RESPONSE ---');
      console.log(res.statusCode);
      console.log(data);
      server.kill();
      process.exit(0);
    });
  });
  req.write('{"persona":{}}');
  req.end();
}, 2000);
