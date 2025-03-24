// Replace with your actual Matrix User ID and Access Token
const matrixUserId = '@atulsh:matrix.org';
const matrixAccessToken = 'syt_YXR1bHNo_gcwPittSdUTwasGLxiJU_2avXSa';


const jwtToken = localStorage.getItem('jwtToken');

// Check if the token is expired
function isTokenExpired(token) {
    const decoded = jwt_decode(token);
    const currentTime = Math.floor(Date.now() / 1000); // Time in seconds
    return decoded.exp < currentTime;
}

// Check if user is logged in
function updateUIBasedOnLoginStatus() {
    if (jwtToken && !isTokenExpired(jwtToken)) {
        document.getElementById('login').style.display = 'none';
        document.getElementById('chat').style.display = 'block';
        fetchMessages(); // Fetch messages on login
    } else {
        document.getElementById('login').style.display = 'block';
        document.getElementById('chat').style.display = 'none';
    }
}

updateUIBasedOnLoginStatus();

// Handle user login
document.getElementById('loginButton').addEventListener('click', () => {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
    })
        .then(response => response.json())
        .then(data => {
            if (data.token) {
                localStorage.setItem('jwtToken', data.token);
                localStorage.setItem('username', username);
                updateUIBasedOnLoginStatus();
                window.location.reload();
            } else {
                displayErrorMessage('Login failed');
            }
        })
        .catch(() => displayErrorMessage('An error occurred during login'));
});

// Handle logout
document.getElementById('logoutButton').addEventListener('click', () => {
    localStorage.removeItem('jwtToken');
    localStorage.removeItem('username');
    updateUIBasedOnLoginStatus();
    window.location.reload();
});

// Fetch initial messages
function fetchMessages() {
    fetch('/api/messages', {
        headers: { 'Authorization': `Bearer ${jwtToken}` }
    })
        .then(response => {
            if (response.status === 401) {
                displayErrorMessage('Session expired. Please log in again.');
                localStorage.removeItem('jwtToken');
                updateUIBasedOnLoginStatus();
            }
            return response.json();
        })
        .then(data => displayMessages(data))
        .catch(() => displayErrorMessage('Failed to fetch messages.'));
}

// Display messages
function displayMessages(messages) {
    const summaryDiv = document.getElementById('summary');
    summaryDiv.innerHTML = '';

    messages.forEach(msg => {
        const msgDiv = document.createElement('div');
        msgDiv.classList.add('message');
        msgDiv.innerHTML = `
            <strong>${msg.sender}</strong> ${new Date(msg.timestamp).toLocaleString()} <br>
            ${msg.content} <br>
            ${msg.attachments.map(att => `<a href="${att}" target="_blank">Attachment</a>`).join(' ')}
            <button class="like-button">Like</button>
        `;
        summaryDiv.appendChild(msgDiv);
    });

    // Add event listeners for like buttons
    document.querySelectorAll('.like-button').forEach(btn => {
        btn.addEventListener('click', (event) => {
            const messageDiv = event.target.closest('.message');
            const messageSender = messageDiv.querySelector('strong').textContent;
            likeMessage(messageSender);
        });
    });
}

// Handle sending a message
document.getElementById('sendButton').addEventListener('click', () => {
    const messageInput = document.getElementById('messageInput').value;
    const fileInput = document.getElementById('fileInput');

    if (!fileInput) {
        return displayErrorMessage('File input element not found');
    }

    const files = fileInput.files;

    // Validate files
    const validFileTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    const maxFileSize = 5 * 1024 * 1024; // 5 MB
    for (let file of files) {
        if (!validFileTypes.includes(file.type)) {
            return displayErrorMessage('Invalid file type. Only JPEG, PNG, and PDF are allowed.');
        }
        if (file.size > maxFileSize) {
            return displayErrorMessage('File size exceeds 5 MB limit.');
        }
    }

    const formData = new FormData();
    formData.append('content', messageInput);
    Array.from(files).forEach(file => formData.append('files', file));

    fetch('/api/messages', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${jwtToken}` },
        body: formData,
    })
        .then(response => response.json())
        .then(data => {
            socket.emit('newMessage', data);
            document.getElementById('messageInput').value = '';
            fileInput.value = ''; // Reset file input
        })
        .catch(() => displayErrorMessage('Failed to send message.'));
});

// Handle real-time new messages
socket.on('newMessage', (message) => {
    displayMessages([message]); // Display single new message
});

// Handle typing indicator
let typingTimeout;
document.getElementById('messageInput').addEventListener('input', () => {
    clearTimeout(typingTimeout);
    socket.emit('typing', { username: localStorage.getItem('username') });

    typingTimeout = setTimeout(() => {
        socket.emit('stopTyping', { username: localStorage.getItem('username') });
    }, 2000); // 2 seconds delay
});

socket.on('typing', (data) => {
    const typingIndicator = document.getElementById('typingIndicator');
    if (data.username !== localStorage.getItem('username')) {
        typingIndicator.textContent = `${data.username} is typing...`;
        typingIndicator.style.display = 'block';
    }
});

socket.on('stopTyping', () => {
    const typingIndicator = document.getElementById('typingIndicator');
    typingIndicator.style.display = 'none';
});

// Handle emoji picker
document.querySelectorAll('.emoji').forEach(emojiBtn => {
    emojiBtn.addEventListener('click', () => {
        const emoji = emojiBtn.getAttribute('data-emoji');
        document.getElementById('messageInput').value += emoji;
    });
});

// Like message functionality
function likeMessage(sender) {
    fetch(`/api/likeMessage`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${jwtToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender })
    })
        .then(response => response.json())
        .then(() => {
            alert('Message liked');
        })
        .catch(() => displayErrorMessage('Failed to like message.'));
}

// Handle Chrome runtime messages
chrome.runtime.sendMessage({ action: 'fetchData' }, (response) => {
    if (chrome.runtime.lastError) {
        console.error('Message error:', chrome.runtime.lastError);
    } else {
        console.log('Response received:', response);
    }
});

// Display error messages
function displayErrorMessage(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 3000);
}
