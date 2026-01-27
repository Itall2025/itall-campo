import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const CONFIG = { 
  key: process.env.OMIE_API_KEY || '4695613971048', 
  secret: process.env.OMIE_API_SECRET || 'adcacd22b1c64d9520965dac570b3afd' 
};
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
            console.log(`  → Resposta página ${paginaAtual}:`, JSON.stringify(data).substring(0, 500));
            totalPaginas = data.nTotPaginas || 1;
            
            if (data.produtos) {
                todosOsProdutos = todosOsProdutos.concat(data.produtos);
                console.log(`  ✅ Estoque página ${paginaAtual}/${totalPaginas}: ${data.produtos.length} produtos`);
            } else {
                console.log(`  ⚠️ Resposta da página ${paginaAtual} não contém 'produtos'`);
            }
            
            paginaAtual++;
        }
        
        // Buscar produtos com imagens - TENTATIVA COM PARÂMETROS DIFERENTES
        console.log('📸 Tentando buscar imagens dos produtos...');
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
                    "param": [{
                        "pagina": 1,
                        "registros_por_pagina": 500,
                        "apenas_importado_api": "N",
                        "filtrar_apenas_omiepdv": "N"
                    }]
                })
            });
            clearTimeout(timeout);
            
            const dataProd = await response.json();
            console.log('  → Resposta API produtos:', JSON.stringify(dataProd).substring(0, 300));
            
            if (dataProd.produto_servico_cadastro && dataProd.produto_servico_cadastro.length > 0) {
                // Debug: mostrar primeiro produto
                const primeiroProd = dataProd.produto_servico_cadastro[0];
                console.log('  → Exemplo produto API:', {
                    codigo_produto: primeiroProd.codigo_produto,
                    codigo_produto_integracao: primeiroProd.codigo_produto_integracao,
                    descricao: primeiroProd.descricao,
                    tem_imagem: primeiroProd.imagens?.length > 0
                });
                
                dataProd.produto_servico_cadastro.forEach(p => {
                    if (p.imagens && p.imagens.length > 0) {
                        // Mapear tanto por codigo_produto quanto por codigo_produto_integracao
                        mapaImagens[p.codigo_produto] = p.imagens[0].url_imagem;
                        if (p.codigo_produto_integracao) {
                            mapaImagens[p.codigo_produto_integracao] = p.imagens[0].url_imagem;
                        }
                    }
                });
                console.log(`  ✅ ${Object.keys(mapaImagens).length} mapeamentos de imagens criados`);
            } else {
                console.log('  ⚠️ API de produtos retornou vazio');
            }
        } catch (err) {
            console.log('  ❌ Erro ao buscar imagens:', err.message);
        }
        
        // Juntar estoque com imagens
        const produtosCompletos = todosOsProdutos.map(p => ({
            ...p,
            url_imagem: mapaImagens[p.cCodigo] || null
        }));
        
        // Debug: mostrar exemplo de estoque
        if (todosOsProdutos.length > 0) {
            console.log('  → Exemplo estoque:', {
                cCodigo: todosOsProdutos[0].cCodigo,
                cDescricao: todosOsProdutos[0].cDescricao,
                url_imagem: mapaImagens[todosOsProdutos[0].cCodigo] || 'NÃO MAPEADO'
            });
        }
        
        const comImagem = produtosCompletos.filter(p => p.url_imagem).length;
        console.log(`✅ Total: ${produtosCompletos.length} produtos (${comImagem} com imagem)`);
        
        const response = {
            nTotRegistros: produtosCompletos.length,
            produtos: produtosCompletos
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
    console.log(`🔐 OMIE_API_KEY env: ${process.env.OMIE_API_KEY ? 'DEFINIDO' : 'NÃO DEFINIDO'}`);
    console.log(`🔐 OMIE_API_SECRET env: ${process.env.OMIE_API_SECRET ? 'DEFINIDO' : 'NÃO DEFINIDO'}`);
    console.log(`🔍 CONFIG completo:`, CONFIG);
});
