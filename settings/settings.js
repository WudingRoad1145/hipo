document.addEventListener('DOMContentLoaded', async () => {
    const apiKeyInput = document.getElementById('api-key');
    const saveButton = document.getElementById('save-settings');
    const statusElement = document.getElementById('status');

    // Load existing settings
    const { apiKey } = await chrome.storage.local.get(['apiKey']);
    if (apiKey) {
        apiKeyInput.value = apiKey;
    }

    saveButton.addEventListener('click', async () => {
        const newApiKey = apiKeyInput.value.trim();
        
        if (!newApiKey) {
            statusElement.textContent = 'Please enter an API key';
            return;
        }

        try {
            await chrome.storage.local.set({
                apiKey: newApiKey
            });
            statusElement.textContent = 'Settings saved successfully!';
            setTimeout(() => {
                statusElement.textContent = '';
            }, 2000);
        } catch (error) {
            statusElement.textContent = 'Failed to save settings';
            console.error('Settings save failed:', error);
        }
    });
});