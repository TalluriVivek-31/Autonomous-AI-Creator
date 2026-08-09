import http from 'http';

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
  });
});

req.write('{"persona":{"name":"Test","domain":"Test"}}');
req.end();
