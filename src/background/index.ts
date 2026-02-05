console.log('[VideoTools-Pro] Background script loaded');

// Setup Broadcast Channel for cross-tab communication
const channel = new BroadcastChannel('video-tools-channel');

channel.onmessage = (event) => {
    console.log('Received message:', event.data);
};

// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed');
});
