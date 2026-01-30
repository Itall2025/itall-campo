import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const OMIE = {
    produtos: 'https://app.omie.com.br/api/v1/geral/produtos/',
    clientes: 'https://app.omie.com.br/api/v1/geral/clientes/',
    estoque: 'https://app.omie.com.br/api/v1/estoque/consulta/',
    tabelasPrecos: 'https://app.omie.com.br/api/v1/produtos/tabelaprecos/',
    formasPagVendas: 'https://app.omie.com.br/api/v1/produtos/formaspagvendas/'
};

const CONFIG = { 
  key: process.env.OMIE_API_KEY || '4695613971048', 
  secret: process.env.OMIE_API_SECRET || 'adcacd22b1c64d9520965dac570b3afd' 
};
let cacheEstoque = null;
let cacheTime = 0;
const CACHE_DURATION = 60000; // 1 minuto

async function omieRequest(endpoint, call, params, timeoutMs = 30000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            },
            signal: controller.signal,
            body: JSON.stringify({
                call,
                app_key: CONFIG.key,
                app_secret: CONFIG.secret,
                param: Array.isArray(params) ? params : [params]
            })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${data?.faultstring || data?.description || 'Erro OMIE'}`);
        }
        if (data?.faultstring || data?.description || data?.omie_fail) {
            const msg = data?.faultstring || data?.description || data?.omie_fail?.description || 'Erro OMIE';
            throw new Error(msg);
        }
        return data;
    } finally {
        clearTimeout(timeout);
    }
}

function isNoRecordsError(message) {
    return /Não existem registros para a página/i.test(message || '');
}

function formatDateDDMMYYYY(date = new Date()) {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
}

function normalizeImageUrl(value) {
    if (!value) return null;
    const v = String(value).trim();
    if (!v) return null;
    if (v.startsWith('http://') || v.startsWith('https://') || v.startsWith('data:image/')) {
        return v;
    }
    // HeurÃ­stica simples para base64
    if (v.length > 120 && /^[A-Za-z0-9+/]+=*$/.test(v)) {
        return `data:image/jpeg;base64,${v}`;
    }
    return v;
}

async function listarProdutosCatalogo() {
    const nRegPorPagina = 200;
    let nPagina = 1;
    let nTotPaginas = 1;
    let produtos = [];

    while (nPagina <= nTotPaginas) {
        const data = await omieRequest(OMIE.produtos, 'ListarProdutos', {
            pagina: nPagina,
            registros_por_pagina: nRegPorPagina,
            apenas_importado_api: 'N',
            filtrar_apenas_omiepdv: 'N'
        });

        const pageItems =
            data?.produto_servico_cadastro ||
            data?.produtos ||
            data?.cadastros ||
            [];

        if (Array.isArray(pageItems)) {
            produtos = produtos.concat(pageItems);
        }

        nTotPaginas = Number(data?.nTotPaginas || data?.total_de_paginas || 1);
        nPagina += 1;
    }

    const map = new Map();
    produtos.forEach(p => {
        const keyCandidates = [
            p?.nCodProd,
            p?.codigo_produto,
            p?.cCodigo,
            p?.codigo,
            p?.cDescricao,
            p?.descricao,
            p?.cCodigoProduto,
            p?.codigo_produto_integracao,
            p?.codigo_produto_omie
        ].filter(v => v != null).map(v => String(v));

        keyCandidates.forEach(k => {
            if (!map.has(k)) {
                map.set(k, p);
            }
        });
    });

    const samples = produtos.slice(0, 5).map(p => ({
        keys: Object.keys(p).slice(0, 25),
        nCodProd: p?.nCodProd,
        cCodigo: p?.cCodigo,
        codigo_produto: p?.codigo_produto,
        codigo: p?.codigo,
        cDescricao: p?.cDescricao,
        descricao: p?.descricao,
        imagens: p?.imagens,
        url_imagem: p?.url_imagem,
        cUrlImagem: p?.cUrlImagem,
        cImagemURL: p?.cImagemURL,
        cImgURL: p?.cImgURL,
        cImagem: p?.cImagem,
        imagem: p?.imagem
    }));

    return { map, samples };
}

// Endpoint para testar conexão com API

app.get('/api/test', (req, res) => {
    res.json({ status: 'ok', message: 'Servidor rodando corretamente' });
});


// Endpoint para sincronizar estoque COM CACHE - BUSCA TODAS AS PÁGINAS + IMAGENS
app.post('/api/estoque', async (req, res) => {
    try {
        const debug = String(req.query?.debug || '') === '1';

        if (!debug && cacheEstoque && (Date.now() - cacheTime) < CACHE_DURATION) {
            return res.json(cacheEstoque);
        }

        const dataPosicao = formatDateDDMMYYYY();
        const nRegPorPagina = 200;
        let nPagina = 1;
        let nTotPaginas = 1;
        let produtos = [];
        const debugImagens = [];

        const catalogoData = await listarProdutosCatalogo();
        const catalogoMap = catalogoData.map;

        while (nPagina <= nTotPaginas) {
            const data = await omieRequest(OMIE.estoque, 'ListarPosEstoque', {
                nPagina,
                nRegPorPagina,
                dDataPosicao: dataPosicao,
                cExibeTodos: 'S',
                codigo_local_estoque: 0
            });

            const pageItems = Array.isArray(data?.produtos) ? data.produtos : [];
            const enriquecidos = pageItems.map(p => {
                const keyCandidates = [
                    p?.nCodProd,
                    p?.cCodigo,
                    p?.codigo_produto,
                    p?.cDescricao
                ].filter(v => v != null).map(v => String(v));
                const info =
                    keyCandidates.map(k => catalogoMap.get(k)).find(Boolean) ||
                    null;

                if (debug && debugImagens.length < 5) {
                    debugImagens.push({
                        cCodigo: p?.cCodigo,
                        nCodProd: p?.nCodProd,
                        estoque: {
                            url_imagem: p?.url_imagem,
                            cUrlImagem: p?.cUrlImagem,
                            cImagemURL: p?.cImagemURL,
                            cImagem: p?.cImagem,
                            cImgURL: p?.cImgURL,
                            imagem: p?.imagem
                        },
                        catalogo: info ? {
                            nCodProd: info?.nCodProd,
                            cCodigo: info?.cCodigo,
                            url_imagem: info?.url_imagem,
                            cUrlImagem: info?.cUrlImagem,
                            cImagemURL: info?.cImagemURL,
                            cImagem: info?.cImagem,
                            cImgURL: info?.cImgURL,
                            imagem: info?.imagem
                        } : null
                    });
                }

                return {
                    ...p,
                    url_imagem: normalizeImageUrl(
                        p?.url_imagem ||
                        p?.imagens?.[0]?.url_imagem ||
                        info?.url_imagem ||
                        info?.imagens?.[0]?.url_imagem ||
                        info?.cUrlImagem ||
                        info?.cImagemURL ||
                        info?.cImgURL ||
                        info?.cImagem ||
                        info?.imagem ||
                        null
                    ),
                    nPrecoUnitario:
                        p?.nPrecoUnitario ??
                        info?.nPrecoUnitario ??
                        info?.nValorUnitario ??
                        info?.nPrecoVenda ??
                        info?.nPreco ??
                        p?.nValorUnitario ??
                        null
                };
            });
            produtos = produtos.concat(enriquecidos);
            nTotPaginas = Number(data?.nTotPaginas || 1);
            nPagina += 1;
        }

        const response = {
            produtos,
            total: produtos.length,
            data_posicao: dataPosicao,
            atualizado_em: new Date().toISOString(),
            ...(debug ? {
                debug_imagens: debugImagens,
                debug_catalogo: catalogoData.samples,
                debug_catalogo_total: catalogoMap.size
            } : {})
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

app.post('/api/tabelas-precos', async (req, res) => {
    try {
        const nRegPorPagina = 50;
        let nPagina = 1;
        let nTotPaginas = 1;
        let tabelas = [];

        while (nPagina <= nTotPaginas) {
            const data = await omieRequest(OMIE.tabelasPrecos, 'ListarTabelasPreco', {
                nPagina,
                nRegPorPagina
            });

            const pageItems = Array.isArray(data?.listaTabelasPreco) ? data.listaTabelasPreco : [];
            tabelas = tabelas.concat(pageItems);
            nTotPaginas = Number(data?.nTotPaginas || 1);
            nPagina += 1;
        }

        const retorno = tabelas.map(t => ({
            id: t.nCodTabPreco,
            nome: t.cNome || t.cCodigo || `Tabela ${t.nCodTabPreco}`,
            ativa: (t.cAtiva || '').toUpperCase() === 'S',
            codigo: t.cCodigo || '',
            origem: t.cOrigem || ''
        }));

        res.json({ tabelas: retorno });
    } catch (error) {
        console.error('âŒ Erro ao listar tabelas de preÃ§o:', error.message);
        res.status(500).json({ erro: error.message, tabelas: [] });
    }
});

app.post('/api/tabela-precos/:id', async (req, res) => {
    try {
        const tabelaId = Number(req.params.id);
        if (!tabelaId) {
            return res.status(400).json({ erro: 'ID da tabela invÃ¡lido', precos: {} });
        }

        const nRegPorPagina = 200;
        let nPagina = 1;
        let nTotPaginas = 1;
        const precos = {};
        let totalItens = 0;

        while (nPagina <= nTotPaginas) {
            const data = await omieRequest(OMIE.tabelasPrecos, 'ListarTabelaItens', {
                nPagina,
                nRegPorPagina,
                nCodTabPreco: tabelaId
            });

            const tabela = data?.listaTabelaPreco || {};
            const itens = Array.isArray(tabela?.itensTabela) ? tabela.itensTabela : [];
            itens.forEach(item => {
                if (item?.nCodProd != null && item?.nValorTabela != null) {
                    precos[item.nCodProd] = Number(item.nValorTabela);
                }
            });

            totalItens += itens.length;
            nTotPaginas = Number(data?.nTotPaginas || 1);
            nPagina += 1;
        }

        res.json({ precos, totalItens });
    } catch (error) {
        console.error('âŒ Erro ao carregar itens da tabela de preÃ§o:', error.message);
        res.status(500).json({ erro: error.message, precos: {} });
    }
});

app.post('/api/formas-pagamento', async (req, res) => {
    try {
        const nRegPorPagina = 50;
        let nPagina = 1;
        let nTotPaginas = 1;
        let formas = [];

        while (nPagina <= nTotPaginas) {
            const data = await omieRequest(OMIE.formasPagVendas, 'ListarFormasPagVendas', {
                pagina: nPagina,
                registros_por_pagina: nRegPorPagina
            });

            const pageItems = Array.isArray(data?.cadastros) ? data.cadastros : [];
            formas = formas.concat(pageItems);
            nTotPaginas = Number(data?.total_de_paginas || data?.nTotPaginas || 1);
            nPagina += 1;
        }

        const retorno = formas.map(f => ({
            codigo: f.cCodigo,
            descricao: f.cDescricao || '',
            parcelas: Number(f.nQtdeParc || 0),
            lista_parcelas: f.cListaParc || '',
            dias_parcela: Number(f.nDiasParc || 0)
        }));

        res.json({ formas: retorno });
    } catch (error) {
        console.error('âŒ Erro ao listar formas de pagamento:', error.message);
        res.status(500).json({ erro: error.message, formas: [] });
    }
});


app.post('/api/clientes', async (req, res) => {
    try {
        const { buscar } = req.body;
        const termo = (buscar || '').trim();
        if (termo.length < 2) {
            return res.json({ clientes: [] });
        }

        const nRegPorPagina = 100;
        const termoNumerico = termo.replace(/\D/g, '');
        const isNumeric = termoNumerico.length >= 2 && termoNumerico.length === termo.length;
        const filtro = isNumeric
            ? { cnpj_cpf: termo }
            : { razao_social: termo, nome_fantasia: termo };

        let clientesOmie = [];
        let nPagina = 1;
        let nTotPaginas = 1;

        while (nPagina <= nTotPaginas) {
            try {
                const data = await omieRequest(OMIE.clientes || "https://app.omie.com.br/api/v1/geral/clientes/", 'ListarClientes', {
                    pagina: nPagina,
                    registros_por_pagina: nRegPorPagina,
                    apenas_importado_api: 'N',
                    clientesFiltro: filtro
                });

                const pageItems = Array.isArray(data?.clientes_cadastro) ? data.clientes_cadastro : [];
                clientesOmie = clientesOmie.concat(pageItems);
                nTotPaginas = Number(data?.nTotPaginas || 1);
                nPagina += 1;
            } catch (err) {
                if (isNoRecordsError(err?.message)) {
                    break;
                }
                throw err;
            }
        }

        if (clientesOmie.length === 0) {
            const maxPaginas = 3;
            let pagina = 1;
            let semFiltro = [];
            while (pagina <= maxPaginas) {
                try {
                    const data = await omieRequest(OMIE.clientes || "https://app.omie.com.br/api/v1/geral/clientes/", 'ListarClientes', {
                        pagina,
                        registros_por_pagina: nRegPorPagina,
                        apenas_importado_api: 'N'
                    });

                    const pageItems = Array.isArray(data?.clientes_cadastro) ? data.clientes_cadastro : [];
                    semFiltro = semFiltro.concat(pageItems);
                    pagina += 1;
                } catch (err) {
                    if (isNoRecordsError(err?.message)) {
                        break;
                    }
                    throw err;
                }
            }

            const termoUpper = termo.toUpperCase();
            const termoDigits = termo.replace(/\D/g, '');
            clientesOmie = semFiltro.filter(c => {
                const razao = (c.razao_social || '').toUpperCase();
                const fantasia = (c.nome_fantasia || '').toUpperCase();
                const cnpj = (c.cnpj_cpf || '').replace(/\D/g, '');
                return (
                    razao.includes(termoUpper) ||
                    fantasia.includes(termoUpper) ||
                    (termoDigits && cnpj.includes(termoDigits))
                );
            });
        }

        const clientesRetorno = clientesOmie.map(c => ({
            nCodCliente: c.codigo_cliente_omie,
            cNomeFantasia: c.nome_fantasia || '',
            cRazaoSocial: c.razao_social || '',
            cCNPJ: c.cnpj_cpf || '',
            cCondPagto: c.recomendacoes?.numero_parcelas || '',
            cCondPagtoDesc: c.recomendacoes?.numero_parcelas ? `${c.recomendacoes.numero_parcelas}x` : 'Padrão'
        }));

        res.json({
            clientes: clientesRetorno,
            debug: {
                termo_buscado: termo,
                total_api: clientesOmie.length,
                total_filtrados: clientesRetorno.length,
                timestamp: new Date().toISOString(),
                versao: '4.0-filtro-omie'
            }
        });
    } catch (error) {
        console.error('❌ Erro ao buscar clientes:', error.message);
        res.status(500).json({ erro: error.message, clientes: [] });
        }
});

app.get('/api/cnpj/:cnpj', async (req, res) => {
    try {
        const cnpj = (req.params.cnpj || '').replace(/\D/g, '');
        if (!cnpj || cnpj.length < 11) {
            return res.status(400).json({ sucesso: false, erro: 'CNPJ inválido' });
        }

        const clienteOmie = await buscarClienteOmie(cnpj);
        if (clienteOmie) {
            return res.json({ sucesso: true, origem: 'OMIE', cliente: clienteOmie });
        }

        const clientePublico = await buscarClienteAPIPublica(cnpj);
        if (clientePublico) {
            return res.json({ sucesso: true, origem: 'PUBLICA', cliente: clientePublico });
        }

        return res.json({ sucesso: false });
    } catch (error) {
        console.error('❌ Erro ao buscar CNPJ:', error.message);
        res.status(500).json({ sucesso: false, erro: error.message });
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






