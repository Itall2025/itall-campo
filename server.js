import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const CONFIG = { key: '4695613971048', secret: 'adcacd22b1c64d9520965dac570b3afd' };
let cacheEstoque = null;
let cacheTime = 0;
const CACHE_DURATION = 60000; // 1 minuto

// Endpoint para testar conexão com API
app.get('/api/test', (req, res) => {
    res.json({ status: 'ok', message: 'Servidor rodando corretamente' });
});

// Endpoint para sincronizar estoque COM CACHE - BUSCA TODAS AS PÁGINAS + IMAGENS
app.post('/api/estoque', async (req, res) => {
    try {
        // Se tem cache e ainda é válido, retornar
        if (cacheEstoque && (Date.now() - cacheTime) < CACHE_DURATION) {
            console.log('📦 Retornando estoque do cache -', cacheEstoque.produtos?.length || 0, 'produtos');
            return res.json(cacheEstoque);
        }
        
        const hoje = new Date().toLocaleDateString('pt-BR');
        console.log('📦 Buscando TODOS os produtos + imagens...');
        
        let todosOsProdutos = [];
        let paginaAtual = 1;
        let totalPaginas = 1;
        
        // Passo 1: Loop para buscar todas as páginas de ESTOQUE
        while (paginaAtual <= totalPaginas) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 30000);
            
            console.log(`  → Buscando estoque página ${paginaAtual}...`);
            
            const response = await fetch("https://app.omie.com.br/api/v1/estoque/consulta/", {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                },
                signal: controller.signal,
                body: JSON.stringify({
                    "call": "ListarPosEstoque",
                    "app_key": CONFIG.key,
                    "app_secret": CONFIG.secret,
                    "param": [{"nPagina": paginaAtual, "nRegPorPagina": 500, "dDataPosicao": hoje, "cExibeTodos": "S", "codigo_local_estoque": 0}]
                })
            });
            clearTimeout(timeout);
            
            const data = await response.json();
            totalPaginas = data.nTotPaginas || 1;
            
            if (data.produtos) {
                todosOsProdutos = todosOsProdutos.concat(data.produtos);
                console.log(`  ✅ Estoque página ${paginaAtual}/${totalPaginas}: ${data.produtos.length} produtos`);
            }
            
            paginaAtual++;
        }
        
        // Passo 2: Buscar produtos com IMAGENS
        console.log('  → Buscando imagens dos produtos...');
        let mapaImagens = {};
        
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 30000);
            
            const response = await fetch("https://app.omie.com.br/api/v1/geral/produtos/", {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                },
                signal: controller.signal,
                body: JSON.stringify({
                    "call": "ListarProdutos",
                    "app_key": CONFIG.key,
                    "app_secret": CONFIG.secret,
                    "param": [{"pagina": 1, "registros_por_pagina": 500, "inativo": "N"}]
                })
            });
            clearTimeout(timeout);
            
            const dataProd = await response.json();
            if (dataProd.produto_servico_cadastro) {
                dataProd.produto_servico_cadastro.forEach(p => {
                    const imagem = p.imagens && p.imagens.length > 0 ? p.imagens[0].url_imagem : null;
                    mapaImagens[p.codigo_produto] = imagem;
                });
                console.log(`  ✅ Imagens carregadas para ${Object.keys(mapaImagens).length} produtos`);
            }
        } catch (err) {
            console.log('  ⚠️ Não conseguiu buscar imagens, continuando sem elas');
        }
        
        // Passo 3: Juntar estoque com imagens
        const produtosComImagens = todosOsProdutos.map(p => ({
            ...p,
            url_imagem: mapaImagens[p.cCodigo] || null
        }));
        
        console.log(`✅ Total de produtos carregados: ${produtosComImagens.length}`);
        
        const response = {
            nTotRegistros: produtosComImagens.length,
            produtos: produtosComImagens
        };
        
        // Salvar em cache
        cacheEstoque = response;
        cacheTime = Date.now();
        
        res.json(response);
    } catch (error) {
        console.error('❌ Erro ao buscar estoque:', error.message);
        // Se falhar mas temos cache, retornar cache mesmo que expirado
        if (cacheEstoque) {
            console.log('✅ Retornando cache expirado como fallback');
            return res.json(cacheEstoque);
        }
        res.status(500).json({ erro: error.message, produtos: [] });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    console.log(`🔑 Usando chaves de API: ${CONFIG.key}`);
});
