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

async function listarProdutosComImagem() {
    let paginaAtual = 1;
    let totalPaginas = 1;
    let produtos = [];

    while (paginaAtual <= totalPaginas) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        console.log(`  → Buscando produtos (imagens) página ${paginaAtual}...`);

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
                "param": [{ "pagina": paginaAtual, "registros_por_pagina": 500, "filtrar_apenas_ativo": "S" }]
            })
        });

        clearTimeout(timeout);

        const data = await response.json();
        totalPaginas = data.nTotPaginas || data.total_de_paginas || 1;

        const lista = data.produtos || data.produto_servico || data.produto || [];
        if (Array.isArray(lista) && lista.length) {
            produtos = produtos.concat(lista);
            console.log(`  ✅ Produtos página ${paginaAtual}/${totalPaginas}: ${lista.length} itens`);
        }

        paginaAtual++;
    }

    const mapa = new Map();
    produtos.forEach((p) => {
        const codigo = p.codigo || p.cCodigo || p.codigo_produto || p.codigo_produto_servico;
        const url = p.url_imagem || p.urlImagem || p.cUrlImagem || p.imagem || p.urlImagemProduto;
        if (codigo && url) {
            mapa.set(String(codigo), url);
        }
    });

    return mapa;
}

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
        console.log('📦 Buscando TODOS os produtos do estoque...');
        
        let todosOsProdutos = [];
        let paginaAtual = 1;
        let totalPaginas = 1;
        
        // Buscar todas as páginas de ESTOQUE
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
        
        console.log(`✅ Total de ${todosOsProdutos.length} produtos carregados`);

        let mapaImagens = null;
        try {
            mapaImagens = await listarProdutosComImagem();
            console.log(`🖼️ Imagens encontradas: ${mapaImagens.size}`);
        } catch (error) {
            console.log('⚠️ Falha ao buscar imagens dos produtos:', error.message);
        }

        if (mapaImagens && mapaImagens.size > 0) {
            todosOsProdutos = todosOsProdutos.map((p) => {
                const codigo = p.cCodigo || p.codigo || p.codigo_produto || p.codigo_produto_servico;
                const urlImagem = mapaImagens.get(String(codigo));
                return urlImagem ? { ...p, url_imagem: p.url_imagem || urlImagem } : p;
            });
        }
        
        const response = {
            nTotRegistros: todosOsProdutos.length,
            produtos: todosOsProdutos
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
