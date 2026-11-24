# 🚀 Guia Passo a Passo: Salvar no GitHub e Ativar no Celular

Este guia traz o passo a passo exato para salvar o projeto **Acompanhamento de Ponto** no seu **GitHub**, mantendo o código seguro e ativando o **GitHub Pages** (hospedagem gratuita com HTTPS), que permite que você e sua equipe abram e instalem o aplicativo direto no celular!

---

## 📌 Etapa 1: Criar o Repositório no GitHub

1. Acesse o site do [GitHub](https://github.com) e faça login na sua conta.
2. No canto superior direito, clique no botão **`+`** e selecione **"New repository"** (Novo repositório).
3. Preencha as informações:
   * **Repository name:** `acompanhamento-de-ponto`
   * **Description (opcional):** `Aplicativo web e mobile para controle de ponto, horários e justificativas.`
   * **Visibilidade:** Escolha **Public** (Público) para poder usar o GitHub Pages gratuitamente.
   * **IMPORTANTE:** Deixe as opções *"Add a README file"*, *"Add .gitignore"* e *"Choose a license"* **DESMARCADAS** (já criamos esses arquivos no projeto).
4. Clique no botão verde **"Create repository"**.
5. Mantenha a página aberta. O GitHub mostrará o link do seu repositório (ex: `https://github.com/SEU-USUARIO/acompanhamento-de-ponto.git`).

---

## 💻 Etapa 2: Comandos no Terminal do seu Computador

1. No seu computador, abra o **Terminal** ou **PowerShell**:
   * Pressione `Win + R`, digite `powershell` e aperte `Enter`.
2. Navegue até a pasta do projeto digitando o comando abaixo:
   ```powershell
   cd "C:\Users\allan\.gemini\antigravity\scratch\acompanhamento-de-ponto"
   ```
3. Inicialize o repositório Git local:
   ```bash
   git init
   ```
4. Adicione todos os arquivos do projeto para o envio:
   ```bash
   git add .
   ```
5. Faça o primeiro commit (registro oficial da versão):
   ```bash
   git commit -m "feat: versao inicial do app Acompanhamento de Ponto com PWA para celular"
   ```
6. Defina o branch principal como `main`:
   ```bash
   git branch -M main
   ```
7. Conecte o repositório local ao seu GitHub *(substitua SEU-USUARIO pelo seu usuário real do GitHub)*:
   ```bash
   git remote add origin https://github.com/SEU-USUARIO/acompanhamento-de-ponto.git
   ```
8. Envie os arquivos para o GitHub:
   ```bash
   git push -u origin main
   ```
   *(Caso o GitHub solicite login, confirme a autenticação na janela do navegador).*

---

## 📱 Etapa 3: Ativar o GitHub Pages (Para Usar e Instalar no Celular)

Os celulares exigem uma conexão segura com **HTTPS** para liberar a instalação de aplicativos PWA e o uso do Service Worker. O GitHub oferece isso de forma gratuita:

1. Na página do seu repositório no GitHub, clique na aba **Settings** (Configurações) no menu superior.
2. No menu lateral esquerdo, clique em **Pages** (dentro da seção "Code and automation").
3. Na seção **"Build and deployment"**:
   * Em **Source**, deixe selecionado **"Deploy from a branch"**.
   * Em **Branch**, mude de `None` para **`main`**.
   * Mantenha a pasta como **`/(root)`**.
   * Clique em **Save**.
4. Aguarde cerca de 1 a 2 minutos e recarregue a página.
5. No topo da página de Pages aparecerá uma caixa verde com o link público do seu app:
   ```text
   Your site is live at https://SEU-USUARIO.github.io/acompanhamento-de-ponto/
   ```

---

## 📲 Etapa 4: Como Instalar no Celular pelo Link do GitHub Pages

Agora qualquer pessoa da equipe pode abrir esse link no celular:

* **No Android (Google Chrome):**
  1. Abra o link gerado pelo GitHub Pages.
  2. Toque no botão **"📲 Instalar App no Celular"** que aparecerá na tela (ou toque nos 3 pontinhos do Chrome e selecione **"Instalar aplicativo"**).
  3. O ícone do **PontoFácil** será instalado na tela do celular e abrirá em tela cheia como um app nativo!

* **No iPhone (Apple Safari):**
  1. Abra o link no Safari.
  2. Toque no botão de **Compartilhar** (quadrado com a setinha para cima).
  3. Selecione **"Adicionar à Tela de Início"**.

---

## 🔄 Como Enviar Alterações Futuras (Quando você fizer melhorias no código)

Sempre que você alterar ou melhorar o aplicativo, envie as novidades para o GitHub com apenas 3 comandos:

```bash
git add .
git commit -m "descricao do que voce melhorou"
git push
```
O GitHub Pages atualizará o aplicativo no celular automaticamente em poucos minutos!
