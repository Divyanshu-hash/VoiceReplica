document.getElementById('grantBtn').addEventListener('click', async () => {
    const status = document.getElementById('status');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        status.textContent = "Permission Granted! You can close this tab and use the extension.";
        status.style.color = "green";
        // Stop tracks to release mic
        stream.getTracks().forEach(track => track.stop());
    } catch (err) {
        console.error(err);
        status.textContent = "Permission Denied: " + err.message;
        status.style.color = "red";
    }
});
