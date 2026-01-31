# 🚀 Deploy no Render.com - Guia Passo a Passo

## Pré-requisitos
- Conta no GitHub (já tem ✅)
- Conta no Render.com (vamos criar)

## 5 Passos para Deploy

### 1️⃣ Criar Conta no Render
1. Acesse https://render.com
2. Clique em **"Sign up"**
3. Escolha **"GitHub"** para conectar sua conta
4. Autorize o Render a acessar seus repositórios

### 2️⃣ Criar Novo Serviço Web
1. No dashboard do Render, clique **"New +"**
2. Selecione **"Web Service"**
3. Procure por **"itall-campo"** e selecione
4. Configure:
   - **Name**: `itall-campo` (ou seu nome preferido)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free` (ou Starter $7/mês para melhor performance)

### 3️⃣ Adicionar Variáveis de Ambiente
Na página de configuração do serviço:

1. Role até **"Environment"**
2. Clique **"Add Secret File"** ou **"Add Environment Variable"**
3. Adicione as credenciais OMIE:
   ```
   OMIE_API_KEY = 4695613971048
   OMIE_API_SECRET = adcacd22b1c64d9520965dac570b3afd
   ```
   ⚠️ **Importante**: Substitua pelos seus valores reais depois!

4. Clique **"Save"**

### 4️⃣ Fazer Deploy
1. Clique **"Create Web Service"**
2. O Render começará automaticamente o deploy (você verá logs em tempo real)
3. Quando aparecer ✅ **"Service is live"**, está pronto!
4. Sua URL será algo como: `https://itall-campo.onrender.com`

### 5️⃣ Testar Acesso
Abra no navegador:
```
https://seu-servico.onrender.com
```

Se ver a página da Itall Campo carregando normalmente = **Sucesso!** 🎉

---

## ⚡ Próximos Deploys (Automáticos!)

Sempre que você fizer `git push` no repositório:
1. Render detecta automaticamente
2. Faz rebuild e redeploy
3. Seu app está atualizado em minutos

---

## 📊 Performance no Render

| Métrica | Esperado |
|---------|----------|
| **Tempo de resposta** | 50-200ms |
| **Uptime** | 99.9% |
| **Banda** | Ilimitada |
| **Auto-restart** | Automático |
| **HTTPS** | ✅ Incluído |

---

## 🔧 Troubleshooting

### Erro: "Port already in use"
✅ Já configurado - o Render usa a variável `$PORT` automaticamente

### Erro: "API key inválida"
1. Verifique as variáveis de ambiente no Render Dashboard
2. Certifique-se que copiou as chaves corretas da OMIE
3. Redeploy o serviço

### App lenta no Render Free
→ Upgrade para o plano **Starter** ($7/mês) para performance melhor

---

## 📝 Comandos Úteis Local (antes de fazer push)

```bash
# Testar localmente com variáveis de ambiente
cp .env.example .env
npm run dev

# Fazer push (isso dispara deploy automático)
git add .
git commit -m "feat: configurar para Render.com"
git push
```

---

## ✅ Checklist Final

- [ ] Conta criada no Render.com
- [ ] Repositório GitHub conectado
- [ ] Variáveis OMIE_API_KEY e OMIE_API_SECRET adicionadas
- [ ] Serviço em "Service is live" status
- [ ] Testado em https://seu-servico.onrender.com
- [ ] Orçamentos funcionando corretamente

---

**Pronto! Sua app está no ar!** 🎉

Qualquer dúvida, avise.
