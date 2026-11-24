# ⏱️ Acompanhamento de Ponto (PontoFácil) - Versão Web & App de Celular (PWA)

Aplicativo web e móvel completo desenvolvido em **HTML5, CSS3 e JavaScript Puro (Vanilla JS)** com suporte à tecnologia **Progressive Web App (PWA)**, permitindo que seja instalado e executado como um aplicativo nativo em celulares Android e iPhone (iOS), sem lojas de apps ou instalações pesadas.

---

## ☁️ Versão 3.0: Uso Real com a Equipe (Supabase)

Os dados agora ficam na nuvem, no **Supabase** (banco PostgreSQL gratuito para começar). Cada pessoa entra com **o próprio e-mail e senha**, em qualquer aparelho, e o gestor acompanha a equipe **em tempo real**.

**Como a segurança funciona:** as regras ficam no próprio banco (*Row Level Security*). Mesmo que alguém mexa no código do site, o Supabase só entrega ao colaborador os registros dele, não deixa ninguém se promover a gestor nem aprovar a própria justificativa. Só e-mails **pré-cadastrados pelo gestor** conseguem criar conta.

### Passo a passo da configuração (uma vez só, ~15 minutos)

1. **Criar o projeto:** entre em [supabase.com](https://supabase.com), crie uma conta e clique em **New project**. Escolha a região **South America (São Paulo)** e anote a senha do banco.
2. **Criar as tabelas:** no menu lateral, abra **SQL Editor → New query**, cole todo o conteúdo do arquivo [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**. (Pode rodar de novo no futuro sem perder dados.)
3. **Cadastrar você como primeiro gestor:** ainda no SQL Editor, rode trocando pelo seu e-mail e nome:
   ```sql
   insert into public.pre_cadastros (email, nome, cargo, depto, perfil)
   values ('seu-email@empresa.com', 'Seu Nome', 'Gestor', 'Diretoria', 'gestor');
   ```
   (escreva o e-mail em letras minúsculas)
4. **Ligar o app ao Supabase:** em **Project Settings → API**, copie o **Project URL** e a chave **anon public** para o arquivo [`config.js`](config.js). A chave *anon* pode ficar no site, pois quem protege os dados são as regras do banco. **Nunca** use a chave `service_role` no site.
5. **Publicar o site (GitHub Pages, grátis):** no GitHub, abra o repositório → **Settings → Pages** → em *Build and deployment* escolha **Deploy from a branch**, branch **main**, pasta **/ (root)** → **Save**. Em ~1 minuto o app fica em `https://<seu-usuario>.github.io/acompanhamento-de-ponto/`.
6. **Avisar o Supabase do endereço do site:** em **Authentication → URL Configuration**, coloque esse endereço em **Site URL** e também em **Redirect URLs**. Assim os links de confirmação de e-mail e de "Esqueci minha senha" voltam para o app.
7. **Criar sua senha:** abra o app, toque em **"Primeiro acesso? Criar conta"**, use o e-mail do passo 3 e crie a senha. Por padrão o Supabase envia um e-mail de confirmação: clique no link e depois entre no app.
   - Para dispensar a confirmação por e-mail: **Authentication → Sign In / Providers → Email → desligue "Confirm email"**.
8. **Cadastrar a equipe:** em **⚙️ Configurações**, faça o pré-cadastro de cada pessoa (nome, e-mail, cargo, departamento, perfil e carga diária). Depois, cada uma abre o app, toca em **"Primeiro acesso? Criar conta"** e cria a própria senha com aquele e-mail.
9. **Trazer os dados antigos (opcional):** se você usava a versão 2.0, abra o app **no mesmo navegador/aparelho** onde estavam os dados, entre como gestor e use **Configurações → Importar deste Navegador** (ou importe um backup JSON). As pessoas são ligadas pelo e-mail, então faça o pré-cadastro delas antes. Nada é duplicado se você importar duas vezes.

### Dia a dia do gestor
* **Desativar** alguém que saiu da empresa: Configurações → 🚫 Desativar. A pessoa não entra mais, e o histórico é preservado.
* **Editar** cargo, perfil ou carga horária: Configurações → ✏️ Editar.
* O sistema não deixa ficar **sem nenhum gestor ativo**.

### Limitações conhecidas
* O horário da batida vem do relógio do aparelho. Para auditoria, cada ajuste manual fica registrado (quem, quando, motivo e batidas anteriores).
* Bater ponto exige internet (o app avisa se a gravação falhar).

---

## 🌟 Novidades da Versão 2.0 (Ponto Flexível)

1. **Saídas Pontuais e Múltiplos Retornos**: além de Entrada e Saída Final, o botão **🟡 Saída Pontual** abre uma tela rápida para escolher o motivo (Almoço, Reunião Externa, Visita Técnica, Consulta, Assunto Pessoal...). É possível registrar quantas saídas e retornos forem necessários no dia; o sistema soma apenas o tempo efetivamente trabalhado (e o "Trabalhado Hoje" conta o período em andamento até o momento atual).
2. **Ajustes e Registros Retroativos**: o botão **✏️ Ajustar / Inserir Ponto** (no topo e em cada linha do histórico) corrige horários, adiciona ou remove batidas e cria registros em dias anteriores. A **localização GPS original é preservada** e cada ajuste fica gravado numa trilha de auditoria (quem ajustou, quando, motivo e as batidas anteriores).
3. **Privacidade por Perfil**: o **Colaborador** vê e ajusta somente os próprios dados; o **Gestor (ADM)** vê o painel da equipe, aprova/rejeita justificativas com parecer, filtra o espelho de ponto de qualquer pessoa e exporta CSV (Excel).
4. **Painel de Configurações (Gestor)**: cadastro de colaboradores e gestores com departamento e carga diária personalizada (ex.: 6h, 8h) e **backup/restauração em JSON**. O sistema impede remover o último gestor.

---

## 📱 Como Funciona a Versão para Celular?

Para transformar o site em um aplicativo de celular sem precisar de bibliotecas pesadas ou publicar na Google Play/Apple Store, implementamos a tecnologia oficial da web moderna chamada **PWA (Progressive Web App)**:

1. **`manifest.json`**:
   - Informa ao Android e iOS que o site é um aplicativo instalável.
   - Define o nome do app, ícone, cor da barra de status e modo de tela cheia (`standalone`), ocultando a barra de endereços do navegador para parecer 100% um app nativo.

2. **`sw.js` (Service Worker)**:
   - Funciona em segundo plano no celular, guardando o aplicativo no cache.
   - Permite que o app abra instantaneamente mesmo se você estiver sem conexão de internet (modo offline).

3. **`icon.svg`**:
   - Ícone vetorial nítido e moderno que fica gravado na tela inicial do celular como o ícone do aplicativo.

4. **Navegação Móvel por Barra Inferior (Bottom Bar)**:
   - Em celulares, os menus laterais são desconfortáveis para o polegar.
   - O aplicativo ativa automaticamente uma barra fixa no rodapé da tela com os botões principais (**Ponto**, **Histórico**, **Justificar**, **Gráficos** e **Gestão**).

5. **Recursos de Celular**:
   - Suporte a vibração tátil ao bater o ponto (`navigator.vibrate`).
   - Registro opcional de localização/GPS no momento da batida.

---

## 🧪 Como Testar a Versão de Celular Direto no Computador

Você não precisa enviar para o celular para ver como ele fica na tela pequena. O próprio navegador do computador simula celulares:

1. Abra o app publicado (veja o passo 5 acima) no seu navegador (Chrome ou Edge). Abrir o `index.html` com duplo clique também funciona para ver as telas, mas os links de e-mail do Supabase só voltam para um endereço `https://`.
2. Pressione a tecla **`F12`** no teclado (ou clique com o botão direito na página e vá em **Inspecionar**).
3. Pressione o atalho **`Ctrl + Shift + M`** (ou clique no ícone que se parece com um celular/tablet no canto superior esquerdo da barra de ferramentas que abriu).
4. No topo, selecione um modelo como **iPhone 14 Pro**, **Pixel 7** ou **Samsung Galaxy**.
5. Observe que:
   - A barra lateral recolhe automaticamente.
   - A barra de navegação no rodapé (**Bottom Navigation Bar**) aparece na parte inferior da tela, perfeitamente posicionada para o polegar.
   - Os botões de ponto ajustam o tamanho para toque facilitado.

---

## 📲 Como Instalar e Usar no Celular Real

Existem duas formas simples de rodar no celular:

### Opção A: Pelo Navegador do Celular (Recomendada)
Se você hospedar esses arquivos em qualquer servidor gratuito (como GitHub Pages, Vercel ou até na rede Wi-Fi local):
* **No Android (Google Chrome):**
  1. Acesse o endereço no navegador do celular.
  2. Um aviso **"Instalar App no Celular"** aparecerá na tela. Basta tocar nele (ou tocar nos 3 pontinhos do Chrome e escolher **"Instalar aplicativo"** ou **"Adicionar à tela inicial"**).
  3. O ícone do **PontoFácil** surgirá na gaveta de aplicativos do seu celular. Ao abrir, ele roda sem barra de URL, em tela cheia!
* **No iPhone (Apple Safari):**
  1. Abra o link no Safari.
  2. Toque no botão de **Compartilhar** (ícone do quadrado com a setinha apontando para cima na barra inferior).
  3. Role um pouco para baixo e toque em **"Adicionar à Tela de Início"**.
  4. Pronto! O app abrirá em tela cheia direto pelo ícone.

### Opção B: Gerar um arquivo `.apk` Instalável (Para o Futuro)
Caso no futuro você queira gerar um arquivo instalável `.apk` para distribuir via WhatsApp ou cabo USB:
* É possível empacotar este mesmo código HTML/CSS/JS usando ferramentas gratuitas como o **Capacitor** ou serviços como o **PWABuilder** (da Microsoft), que pegam o seu `manifest.json` e geram um APK pronto sem você ter que reescrever nada em Java ou Kotlin.
