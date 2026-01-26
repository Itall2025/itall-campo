import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const CONFIG = { key: '4695613971048', secret: 'adcacd22b1c64d9520965dac570b3afd' };

// Endpoint para sincronizar estoque
app.post('/api/estoque', async (req, res) => {
    try {
        const hoje = new Date().toLocaleDateString('pt-BR');
        const response = await fetch("https://app.omie.com.br/api/v1/estoque/consulta/", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                "call": "ListarPosEstoque",
                "app_key": CONFIG.key,
                "app_secret": CONFIG.secret,
                "param": [{"nPagina": 1, "nRegPorPagina": 500, "dDataPosicao": hoje, "cExibeTodos": "S", "codigo_local_estoque": 0}]
            })
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Erro ao buscar estoque:', error);
        res.status(500).json({ erro: error.message });
    }
});

// Endpoint para sincronizar produtos
app.post('/api/produtos', async (req, res) => {
    try {
        const response = await fetch("https://app.omie.com.br/api/v1/geral/produtos/", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                "call": "ListarProdutos",
                "app_key": CONFIG.key,
                "app_secret": CONFIG.secret,
                "param": [{"pagina": 1, "registros_por_pagina": 500, "inativo": "N"}]
            })
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Erro ao buscar produtos:', error);
        res.status(500).json({ erro: error.message });
    }
});

// Endpoint para buscar CNPJ
app.get('/api/cnpj/:cnpj', async (req, res) => {
    try {
        const response = await fetch(`https://publica.cnpj.ws/cnpj/${req.params.cnpj}`);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Erro ao buscar CNPJ:', error);
        res.status(500).json({ erro: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
