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
                    tem_imagem: primeiroProd.imagens?.length > 0,
                    imagem_url: primeiroProd.imagens?.[0]?.url_imagem
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
                console.log(`  🔍 Primeiras 5 chaves do mapa:`, Object.keys(mapaImagens).slice(0, 5));
            } else {
                console.log('  ⚠️ API de produtos retornou vazio');
            }
        } catch (err) {
            console.log('  ❌ Erro ao buscar imagens:', err.message);
        }
        
        // Juntar estoque com imagens
        const produtosCompletos = todosOsProdutos.map(p => ({
            ...p,
            url_imagem: mapaImagens[p.nCodProd] || null
        }));
        
        // Debug: mostrar exemplo de estoque
        if (todosOsProdutos.length > 0) {
            console.log('  → Exemplo estoque:', {
                nCodProd: todosOsProdutos[0].nCodProd,
                cCodigo: todosOsProdutos[0].cCodigo,
                cDescricao: todosOsProdutos[0].cDescricao,
                url_imagem: mapaImagens[todosOsProdutos[0].nCodProd] || 'NÃO MAPEADO'
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

// Endpoint para buscar clientes do Omie
app.post('/api/clientes', async (req, res) => {
    try {
        const { buscar } = req.body;
        const termo = (buscar || '').toLowerCase().trim();
        
        console.log(`\n👥 BUSCA DE CLIENTES`);
        console.log(`  Termo recebido: "${buscar}"`);
        console.log(`  Termo limpo: "${termo}" (length: ${termo.length})`);
        
        if (termo.length < 2) {
            console.log(`  ⚠️ Termo muito curto (< 2), retornando vazio`);
            return res.json({ clientes: [] });
        }
        
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        
        // Listar clientes da OMIE
        console.log(`  📡 Buscando clientes da API OMIE...`);
        const response = await fetch("https://app.omie.com.br/api/v1/geral/clientes/", {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            },
            signal: controller.signal,
            body: JSON.stringify({
                "call": "ListarClientes",
                "app_key": CONFIG.key,
                "app_secret": CONFIG.secret,
                "param": [{
                    "pagina": 1,
                    "registros_por_pagina": 500,
                    "apenas_importado_api": "N"
                }]
            })
        });
        clearTimeout(timeout);
        
        const data = await response.json();
        console.log(`  ✅ API retornou ${data.clientes_cadastro?.length || 0} clientes`);
        
        let clientesRetorno = [];
        
        if (data.clientes_cadastro && Array.isArray(data.clientes_cadastro)) {
            // APLICAR FILTRO LOCALMENTE
            console.log(`  🔍 Aplicando filtro com termo: "${termo}"`);
            console.log(`  → Total de clientes antes do filtro: ${data.clientes_cadastro.length}`);
            console.log(`  → Exemplo de cliente:`, {
                razao: data.clientes_cadastro[0]?.razao_social,
                fantasia: data.clientes_cadastro[0]?.nome_fantasia
            });
            
            const resultadosFiltro = [];
            
            // Filtrar manualmente para ter mais controle
            for (const c of data.clientes_cadastro) {
                const razao = (c.razao_social || '').toLowerCase().trim();
                const fantasia = (c.nome_fantasia || '').toLowerCase().trim();
                const cnpj = (c.cnpj_cpf || '').replace(/\D/g, '');
                const termoLimpo = termo.replace(/\D/g, '');
                
                // Verificar se o termo está em algum desses campos
                if (razao.includes(termo) || fantasia.includes(termo) || cnpj.includes(termoLimpo)) {
                    resultadosFiltro.push(c);
                    
                    // Log do primeiro match
                    if (resultadosFiltro.length === 1) {
                        console.log(`  ✅ PRIMEIRO MATCH:`, {
                            razao: c.razao_social,
                            fantasia: c.nome_fantasia,
                            razao_match: razao.includes(termo),
                            fantasia_match: fantasia.includes(termo),
                            cnpj_match: cnpj.includes(termoLimpo)
                        });
                    }
                }
            }
            
            console.log(`  🔍 Após aplicar filtro: ${resultadosFiltro.length} clientes encontrados`);
            
            if (resultadosFiltro.length > 0) {
                console.log(`  → Primeiros 3 resultados:`);
                resultadosFiltro.slice(0, 3).forEach((c, idx) => {
                    console.log(`     ${idx + 1}. ${c.razao_social || c.nome_fantasia} | ${c.cnpj_cpf}`);
                });
            } else {
                console.log(`  ⚠️ Nenhum cliente passou pelo filtro com o termo "${termo}"`);
            }
            
            // Limitar a 20 resultados e mapear
            clientesRetorno = resultadosFiltro
                .slice(0, 20)
                .map(c => ({
                    nCodCliente: c.codigo_cliente_omie,
                    cNomeFantasia: c.nome_fantasia || '',
                    cRazaoSocial: c.razao_social || '',
                    cCNPJ: c.cnpj_cpf || '',
                    cCondPagto: c.recomendacoes?.numero_parcelas || '',
                    cCondPagtoDesc: c.recomendacoes?.numero_parcelas ? `${c.recomendacoes.numero_parcelas}x` : 'Padrão'
                }));
                
            console.log(`  ✅ Retornando ${clientesRetorno.length} clientes ao frontend\n`);
        } else {
            console.log(`  ⚠️ Resposta inválida da API\n`);
        }
        
        res.json({ 
            clientes: clientesRetorno,
            debug: {
                termo_buscado: termo,
                total_api: data.clientes_cadastro?.length || 0,
                total_filtrados: clientesRetorno.length,
                timestamp: new Date().toISOString(),
                versao: '2.0'
            }
        });
    } catch (error) {
        console.error('❌ Erro ao buscar clientes:', error.message);
        res.status(500).json({ erro: error.message, clientes: [] });
    }
});

// Endpoint para listar formas de pagamento
app.post('/api/formas-pagamento', async (req, res) => {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        
        console.log('💳 Buscando formas de pagamento...');
        
        const response = await fetch("https://app.omie.com.br/api/v1/produtos/formaspagvendas/", {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            },
            signal: controller.signal,
            body: JSON.stringify({
                "call": "ListarFormasPagVendas",
                "app_key": CONFIG.key,
                "app_secret": CONFIG.secret,
                "param": [{
                    "pagina": 1,
                    "registros_por_pagina": 100
                }]
            })
        });
        clearTimeout(timeout);
        
        const data = await response.json();
        
        if (data.cadastros && Array.isArray(data.cadastros)) {
            console.log(`  ✅ ${data.cadastros.length} formas de pagamento encontradas`);
            res.json({ 
                formas: data.cadastros.map(f => ({
                    codigo: f.cCodigo,
                    descricao: f.cDescricao,
                    parcelas: f.nQtdeParc
                }))
            });
        } else {
            console.log('  ⚠️ Nenhuma forma de pagamento encontrada');
            res.json({ formas: [] });
        }
    } catch (error) {
        console.error('❌ Erro ao buscar formas de pagamento:', error.message);
        res.status(500).json({ erro: error.message, formas: [] });
    }
});

// Endpoint para listar tabelas de preços
app.post('/api/tabelas-precos', async (req, res) => {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        
        console.log('📊 Buscando tabelas de preços...');
        
        const response = await fetch("https://app.omie.com.br/api/v1/produtos/tabelaprecos/", {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            },
            signal: controller.signal,
            body: JSON.stringify({
                "call": "ListarTabelasPreco",
                "app_key": CONFIG.key,
                "app_secret": CONFIG.secret,
                "param": [{
                    "nPagina": 1,
                    "nRegPorPagina": 100
                }]
            })
        });
        clearTimeout(timeout);
        
        const data = await response.json();
        
        if (data.listaTabelasPreco && Array.isArray(data.listaTabelasPreco)) {
            console.log(`  ✅ ${data.listaTabelasPreco.length} tabelas encontradas`);
            res.json({ 
                tabelas: data.listaTabelasPreco.map(t => ({
                    id: t.nCodTabPreco,
                    nome: t.cNome,
                    codigo: t.cCodigo,
                    ativa: t.cAtiva === 'S'
                }))
            });
        } else {
            console.log('  ⚠️ Nenhuma tabela encontrada');
            res.json({ tabelas: [] });
        }
    } catch (error) {
        console.error('❌ Erro ao buscar tabelas:', error.message);
        res.status(500).json({ erro: error.message, tabelas: [] });
    }
});

// Endpoint para buscar itens de uma tabela de preços específica
app.post('/api/tabela-precos/:id', async (req, res) => {
    try {
        const nCodTabPreco = parseInt(req.params.id);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        
        console.log(`📊 Buscando itens da tabela ${nCodTabPreco}...`);
        
        const response = await fetch("https://app.omie.com.br/api/v1/produtos/tabelaprecos/", {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            },
            signal: controller.signal,
            body: JSON.stringify({
                "call": "ListarTabelaItens",
                "app_key": CONFIG.key,
                "app_secret": CONFIG.secret,
                "param": [{
                    "nCodTabPreco": nCodTabPreco,
                    "nPagina": 1,
                    "nRegPorPagina": 500
                }]
            })
        });
        clearTimeout(timeout);
        
        const data = await response.json();
        
        if (data.listaTabelaPreco && data.listaTabelaPreco.itensTabela) {
            const itens = data.listaTabelaPreco.itensTabela;
            console.log(`  ✅ ${itens.length} itens encontrados`);
            
            // Mapear preços por código do produto
            const mapaPrecos = {};
            itens.forEach(item => {
                mapaPrecos[item.nCodProd] = item.nValorTabela;
            });
            
            res.json({ 
                nomeTabela: data.listaTabelaPreco.cNome,
                precos: mapaPrecos
            });
        } else {
            console.log('  ⚠️ Nenhum item encontrado na tabela');
            res.json({ precos: {} });
        }
    } catch (error) {
        console.error('❌ Erro ao buscar itens da tabela:', error.message);
        res.status(500).json({ erro: error.message, precos: {} });
    }
});

// Endpoint para buscar cliente por CNPJ
app.get('/api/cnpj/:cnpj', async (req, res) => {
    try {
        const { cnpj } = req.params;
        
        if (!cnpj || cnpj.length < 11) {
            return res.status(400).json({ erro: 'CNPJ inválido', clientes: [] });
        }
        
        console.log(`🔎 Buscando cliente por CNPJ: ${cnpj}...`);
        
        // Primeiro tenta buscar no OMIE
        let cliente = await buscarClienteOmie(cnpj);
        
        if (cliente) {
            console.log(`  ✅ Cliente encontrado NO OMIE: ${cliente.razao_social}`);
            return res.json({
                sucesso: true,
                origem: 'OMIE',
                cliente: cliente
            });
        }
        
        console.log(`  ⚠️ Cliente não encontrado no OMIE, tentando API pública...`);
        
        // Fallback: tenta API pública de CNPJ
        cliente = await buscarClienteAPIPublica(cnpj);
        
        if (cliente) {
            console.log(`  ✅ Cliente encontrado em API PÚBLICA: ${cliente.razao_social}`);
            return res.json({
                sucesso: true,
                origem: 'API_PUBLICA',
                cliente: cliente
            });
        }
        
        console.log(`  ❌ Cliente não encontrado em nenhuma fonte`);
        res.json({ 
            sucesso: false, 
            mensagem: 'Cliente não encontrado no OMIE nem em registros públicos',
            cliente: null 
        });
        
    } catch (error) {
        console.error('❌ Erro ao buscar cliente por CNPJ:', error.message);
        res.status(500).json({ erro: error.message, sucesso: false });
    }
});

// Função auxiliar: buscar cliente no OMIE por CNPJ
async function buscarClienteOmie(cnpj) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        
        console.log(`    🔍 Consultando OMIE com CNPJ: ${cnpj}`);
        
        // Primeiro tenta com filtro (mais rápido)
        const response = await fetch("https://app.omie.com.br/api/v1/geral/clientes/", {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            },
            signal: controller.signal,
            body: JSON.stringify({
                "call": "ListarClientes",
                "app_key": CONFIG.key,
                "app_secret": CONFIG.secret,
                "param": [{
                    "pagina": 1,
                    "registros_por_pagina": 100,
                    "apenas_importado_api": "N",
                    "clientesFiltro": {
                        "cnpj_cpf": cnpj
                    }
                }]
            })
        });
        clearTimeout(timeout);
        
        const data = await response.json();
        console.log(`    → Response OMIE com filtro:`, {
            status: response.status,
            tem_clientes: !!data.clientes_cadastro,
            total: data.clientes_cadastro?.length || 0,
            chaves_resposta: Object.keys(data).slice(0, 5)
        });
        
        if (data.clientes_cadastro && Array.isArray(data.clientes_cadastro) && data.clientes_cadastro.length > 0) {
            const c = data.clientes_cadastro[0];
            console.log(`    ✅ Cliente encontrado com filtro:`, {
                razao_social: c.razao_social,
                cnpj_cpf: c.cnpj_cpf,
                codigo_cliente_omie: c.codigo_cliente_omie
            });
            return {
                razao_social: c.razao_social,
                nome_fantasia: c.nome_fantasia,
                cnpj_cpf: c.cnpj_cpf,
                codigo_cliente_omie: c.codigo_cliente_omie,
                recomendacoes: c.recomendacoes
            };
        }
        
        // Se não encontrar com filtro, lista primeira página e filtra localmente
        console.log(`    ⚠️ Filtro não retornou resultado, tentando listar e filtrar localmente...`);
        
        const responseListar = await fetch("https://app.omie.com.br/api/v1/geral/clientes/", {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            },
            signal: controller.signal,
            body: JSON.stringify({
                "call": "ListarClientes",
                "app_key": CONFIG.key,
                "app_secret": CONFIG.secret,
                "param": [{
                    "pagina": 1,
                    "registros_por_pagina": 500,
                    "apenas_importado_api": "N"
                }]
            })
        });
        clearTimeout(timeout);
        
        const dataListar = await responseListar.json();
        console.log(`    → Listou ${dataListar.clientes_cadastro?.length || 0} clientes da página 1`);
        
        if (dataListar.clientes_cadastro && Array.isArray(dataListar.clientes_cadastro)) {
            // Filtrar localmente por CNPJ
            const clienteEncontrado = dataListar.clientes_cadastro.find(c => 
                (c.cnpj_cpf || '').replace(/\D/g, '') === cnpj.replace(/\D/g, '')
            );
            
            if (clienteEncontrado) {
                console.log(`    ✅ Cliente encontrado no filtro local:`, {
                    razao_social: clienteEncontrado.razao_social,
                    cnpj_cpf: clienteEncontrado.cnpj_cpf
                });
                return {
                    razao_social: clienteEncontrado.razao_social,
                    nome_fantasia: clienteEncontrado.nome_fantasia,
                    cnpj_cpf: clienteEncontrado.cnpj_cpf,
                    codigo_cliente_omie: clienteEncontrado.codigo_cliente_omie,
                    recomendacoes: clienteEncontrado.recomendacoes
                };
            }
        }
        
        console.log(`    ❌ Cliente não encontrado nem com filtro nem em primeira página`);
        return null;
    } catch (error) {
        console.error('    ❌ Erro OMIE:', error.message);
        return null;
    }
}

// Função auxiliar: buscar cliente em API pública (Minha Receita Federal)
async function buscarClienteAPIPublica(cnpj) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        
        // Tenta usar a API pública da Minha Receita Federal (gratuita, sem autenticação)
        const response = await fetch(`https://minhareceita.org/${cnpj}`, {
            method: 'GET',
            headers: { 
                'User-Agent': 'Mozilla/5.0'
            },
            signal: controller.signal
        });
        clearTimeout(timeout);
        
        const data = await response.json();
        console.log(`    → Response API Pública (resumo):`, {
            status: response.status,
            nome: data.nome ? 'encontrado' : 'não encontrado'
        });
        
        if (data && data.nome) {
            return {
                razao_social: data.nome || data.nome_fantasia || '',
                nome_fantasia: data.nome_fantasia || '',
                cnpj_cpf: data.cnpj || cnpj,
                codigo_cliente_omie: null,
                recomendacoes: null,
                origem_externa: true,
                logradouro: data.logradouro,
                numero: data.numero,
                complemento: data.complemento,
                bairro: data.bairro,
                municipio: data.municipio,
                uf: data.uf,
                cep: data.cep
            };
        }
        
        return null;
    } catch (error) {
        console.error('    ❌ Erro API Pública:', error.message);
        return null;
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    console.log(`🔑 Usando chaves de API: ${CONFIG.key}`);
    console.log(`🔐 OMIE_API_KEY env: ${process.env.OMIE_API_KEY ? 'DEFINIDO' : 'NÃO DEFINIDO'}`);
    console.log(`🔐 OMIE_API_SECRET env: ${process.env.OMIE_API_SECRET ? 'DEFINIDO' : 'NÃO DEFINIDO'}`);
    console.log(`🔍 CONFIG completo:`, CONFIG);
});
