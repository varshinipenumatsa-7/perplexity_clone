document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded');

    // Select elements
    const textarea = document.querySelector('.search-input-wrapper textarea');
    const submitBtn = document.querySelector('.submit-btn');
    const attachBtn = document.getElementById('attach-btn');
    const fileInput = document.getElementById('file-upload');
    const documentStatus = document.getElementById('document-status');
    const chatHistory = document.getElementById('chat-history');
    const appContainer = document.querySelector('.app-container');
    const tabs = document.querySelectorAll('.tab-btn');
    const navItems = document.querySelectorAll('.sidebar-nav .nav-item');

    // Debug check
    if (!textarea || !submitBtn || !chatHistory || !appContainer) {
        console.error('Missing critical DOM elements:', { textarea, submitBtn, chatHistory, appContainer });
        return;
    }

    // Auto-resize textarea
    textarea.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        if (this.value === '') {
            this.style.height = '24px';
        }
    });

    // Suggestion Tabs
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
        });
    });

    // File Upload Handling
    attachBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return;

        if (file.type !== 'application/pdf') {
            alert('Please select a PDF file.');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            if (data.status === 'success') {
                documentStatus.querySelector('.filename').textContent = file.name;
                documentStatus.style.display = 'flex';
                console.log('PDF context active:', data.info);
            } else {
                alert('Upload failed: ' + data.error);
            }
        } catch (error) {
            console.error('Upload error:', error);
            alert('Error uploading file.');
        }
    });

    documentStatus.querySelector('.remove-doc').addEventListener('click', async () => {
        try {
            await fetch('/api/clear-context', { method: 'POST' });
            documentStatus.style.display = 'none';
            fileInput.value = '';
        } catch (error) {
            console.error('Clear error:', error);
        }
    });

    // Sidebar navigation
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
        });
    });

    // Chat functionality
    async function sendMessage() {
        const query = textarea.value.trim();
        if (!query) return;

        console.log('Sending message:', query);

        // Enter chat mode
        appContainer.classList.add('chat-active');
        
        // Clear textarea
        textarea.value = '';
        textarea.style.height = '24px';

        // Add user message to UI
        addMessageToUI('user', query);

        // Show loading state
        submitBtn.classList.add('loading');
        submitBtn.disabled = true;

        try {
            // Using 127.0.0.1 which is often more reliable on local dev
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message: query }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Server responded with ${response.status}`);
            }

            const data = await response.json();
            console.log('Received response:', data);

            if (data.status === 'success') {
                addMessageToUI('ai', data.response);
            } else {
                addMessageToUI('ai', 'Error: ' + (data.error || 'Failed to get response'));
            }
        } catch (error) {
            console.error('Fetch error:', error);
            addMessageToUI('ai', `Error: ${error.message}. Please ensure the server is running.`);
        } finally {
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
        }
    }

    function addMessageToUI(role, text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${role}-message`;
        
        const isAI = role === 'ai';
        const iconClass = isAI ? 'fa-solid fa-cube ai-icon' : 'fa-regular fa-user user-icon';
        const label = isAI ? 'Perplexity' : 'You';

        messageDiv.innerHTML = `
            <div class="message-header">
                <div class="${isAI ? 'ai-icon' : 'user-icon'}">
                    <i class="${iconClass}"></i>
                </div>
                <span>${label}</span>
            </div>
            <div class="message-content ${isAI ? 'ai-content' : 'user-content'}">${text}</div>
        `;
        
        chatHistory.appendChild(messageDiv);
        
        // Auto scroll to bottom
        window.scrollTo({
            top: document.body.scrollHeight,
            behavior: 'smooth'
        });
    }

    // Event listeners
    submitBtn.addEventListener('click', sendMessage);
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    console.log('Script initialized successfully');
});
