# ⏱️ Acompanhamento de Ponto (PontoFácil) - Versão Web & App de Celular (PWA)

Aplicativo web e móvel completo desenvolvido em **HTML5, CSS3 e JavaScript Puro (Vanilla JS)** com suporte à tecnologia **Progressive Web App (PWA)**, permitindo que seja instalado e executado como um aplicativo nativo em celulares Android e iPhone (iOS), sem lojas de apps ou instalações pesadas.

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

1. Dê um duplo clique no arquivo **`index.html`** no seu navegador (Chrome ou Edge).
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
