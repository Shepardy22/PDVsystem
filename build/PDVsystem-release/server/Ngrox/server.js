const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// Carregar .env manualmente se necessário ou confiar que o processo pai já fez isso
// O app principal roda na porta 8787
const PORT = 8787;

console.log('====================================');
console.log('INICIANDO TÚNEL NGROK PARA PDVsysten');
console.log('====================================');

// Comando para iniciar o ngrok
// --config pode ser usado se quisermos apontar para um arquivo específico, 
// mas geralmente o ngrok usa o config padrão do sistema onde o authtoken já está salvo.
const command = `ngrok http ${PORT}`;

console.log(`[INFO] Abrindo túnel para http://localhost:${PORT}...`);

const tunnel = exec(command);

tunnel.stdout.on('data', (data) => {
    console.log(`[NGROK] ${data}`);
});

tunnel.stderr.on('data', (data) => {
    console.error(`[NGROK ERROR] ${data}`);
});

tunnel.on('close', (code) => {
    console.log(`[INFO] Túnel encerrado com código ${code}`);
});

console.log('[SUCESSO] Se o ngrok estiver autenticado, procure pela URL "Forwarding" acima.');
console.log('[DICA] Pressione Ctrl+C para encerrar o túnel.');
