// Adiciona o Font Awesome ao documento
const fontAwesome = document.createElement('link');
fontAwesome.rel = 'stylesheet';
fontAwesome.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';
document.head.appendChild(fontAwesome);

// Adiciona o CSS do modal ao documento
const style = document.createElement('style');
style.textContent = `
@keyframes modalFadeIn {
    from {
        opacity: 0;
        transform: translateY(-20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes buttonPop {
    0% {
        transform: scale(1);
    }
    50% {
        transform: scale(1.05);
    }
    100% {
        transform: scale(1);
    }
}

.url-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(5px);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999;
    opacity: 0;
    animation: modalFadeIn 0.3s ease forwards;
}

.url-modal {
    background: rgba(255, 255, 255, 0.95);
    padding: 25px;
    border-radius: 16px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
    width: 90%;
    max-width: 600px;
    position: relative;
    transform: translateY(-20px);
    animation: modalFadeIn 0.3s ease forwards;
    border: 1px solid rgba(255, 255, 255, 0.2);
}

.url-modal h3 {
    margin: 0 0 20px 0;
    color: #2c3e50;
    font-size: 24px;
    display: flex;
    align-items: center;
    gap: 10px;
}

.url-modal h3 i {
    color: #007bff;
}

.url-modal-close {
    position: absolute;
    top: 15px;
    right: 15px;
    border: none;
    background: none;
    font-size: 20px;
    cursor: pointer;
    color: #666;
    transition: all 0.2s ease;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
}

.url-modal-close:hover {
    background: rgba(0, 0, 0, 0.1);
    transform: rotate(90deg);
}

.url-modal-content {
    margin-top: 20px;
}

.url-display {
    background: rgba(0, 0, 0, 0.05);
    padding: 15px;
    border-radius: 8px;
    word-break: break-all;
    margin: 15px 0;
    border: 1px solid rgba(0, 0, 0, 0.1);
    font-family: 'Monaco', monospace;
    font-size: 14px;
    color: #2c3e50;
    position: relative;
    transition: all 0.3s ease;
}

.url-display:hover {
    background: rgba(0, 0, 0, 0.07);
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.button-group {
    display: flex;
    gap: 12px;
    margin-top: 20px;
}

.modal-button {
    flex: 1;
    padding: 12px 20px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 16px;
    font-weight: 500;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    position: relative;
    overflow: hidden;
}

.modal-button i {
    font-size: 18px;
}

.modal-button::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 100%;
    height: 100%;
    background: rgba(255, 255, 255, 0.2);
    transform: translate(-50%, -50%) scale(0);
    border-radius: 50%;
    transition: transform 0.5s ease;
}

.modal-button:active::after {
    transform: translate(-50%, -50%) scale(2);
}

.copy-button {
    background: linear-gradient(135deg, #007bff, #0056b3);
    color: white;
}

.copy-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 123, 255, 0.3);
    animation: buttonPop 0.3s ease;
}

.copy-button.copied {
    background: linear-gradient(135deg, #28a745, #1e7e34);
}

.open-button {
    background: linear-gradient(135deg, #6c757d, #495057);
    color: white;
}

.open-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(108, 117, 125, 0.3);
    animation: buttonPop 0.3s ease;
}
`;
document.head.appendChild(style);

// Função para criar e mostrar o modal
function showUrlModal(url) {
    const modalHtml = `
        <div class="url-modal-overlay">
            <div class="url-modal">
                <button class="url-modal-close">
                    <i class="fas fa-times"></i>
                </button>
                <h3><i class="fas fa-link"></i> URL Capturada</h3>
                <div class="url-modal-content">
                    <div class="url-display">${url}</div>
                    <div class="button-group">
                        <button class="modal-button copy-button">
                            <i class="fas fa-copy"></i> Copiar URL
                        </button>
                        <button class="modal-button open-button">
                            <i class="fas fa-external-link-alt"></i> Abrir em Nova Aba
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHtml;
    document.body.appendChild(modalContainer);

    // Adiciona os event listeners
    const closeButton = modalContainer.querySelector('.url-modal-close');
    const copyButton = modalContainer.querySelector('.copy-button');
    const openButton = modalContainer.querySelector('.open-button');
    const overlay = modalContainer.querySelector('.url-modal-overlay');

    closeButton.addEventListener('click', () => {
        modalContainer.style.opacity = '0';
        setTimeout(() => modalContainer.remove(), 300);
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            modalContainer.style.opacity = '0';
            setTimeout(() => modalContainer.remove(), 300);
        }
    });

    copyButton.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(url);
            copyButton.innerHTML = '<i class="fas fa-check"></i> Copiado!';
            copyButton.classList.add('copied');
            copyButton.style.transform = 'scale(1.05)';
            setTimeout(() => {
                copyButton.innerHTML = '<i class="fas fa-copy"></i> Copiar URL';
                copyButton.classList.remove('copied');
                copyButton.style.transform = 'scale(1)';
            }, 2000);
        } catch (err) {
            console.error('Erro ao copiar:', err);
            copyButton.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Erro ao copiar';
        }
    });

    openButton.addEventListener('click', () => {
        // Usa o originalWindowOpen armazenado para abrir a URL
        originalWindowOpen(url, '_blank');
        openButton.innerHTML = '<i class="fas fa-check"></i> Aberto!';
        setTimeout(() => {
            openButton.innerHTML = '<i class="fas fa-external-link-alt"></i> Abrir em Nova Aba';
        }, 2000);
    });
}

// Armazena a referência original do window.open
const originalWindowOpen = window.open.bind(window);

// Função para interceptar o redirecionamento
function captureRedirect() {
    // Encontra o elemento do botão
    const button = document.querySelector('.MuiCard-root');
    
    if (button) {
        // Sobrescreve a função window.open
        window.open = function() {
            const url = arguments[0];
            console.log('Tentativa de abrir nova aba com URL:', url);
            showUrlModal(url);
            // Não chama o originalWindowOpen, bloqueando a abertura automática
            return null;
        };

        // Monitora cliques em todo o documento
        document.addEventListener('click', function(e) {
            const path = e.composedPath();
            let urlFound = false;
            
            path.forEach(element => {
                if (element.href || (element.dataset && element.dataset.href)) {
                    e.preventDefault(); // Previne o comportamento padrão do clique
                    const url = element.href || element.dataset.href;
                    console.log('Link encontrado:', url);
                    showUrlModal(url);
                    urlFound = true;
                }
            });

            // Se encontrou uma URL, previne a propagação do evento
            if (urlFound) {
                e.stopPropagation();
            }
        }, true);

        console.log('Monitoramento adicionado ao botão. Clique nele para capturar a URL.');
    } else {
        console.log('Botão não encontrado. Verifique se o seletor está correto.');
    }
}

// Executa a função
captureRedirect(); 