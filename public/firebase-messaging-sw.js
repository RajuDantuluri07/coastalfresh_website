// This file must be in the public root folder.

// Scripts for Firebase
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-messaging-compat.js');

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCCeLy8PNUK480m_o-GpRWbdRB59R3UTqw",
  authDomain: "coastal-fresh---sea-foods.firebaseapp.com",
  projectId: "coastal-fresh---sea-foods",
  storageBucket: "coastal-fresh---sea-foods.appspot.com",
  messagingSenderId: "782759620106",
  appId: "1:782759620106:web:960ec7c125faa30675f9f3",
  measurementId: "G-GSHMPRYPW1"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// Handler for background messages
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);

  // Data messages are received in the `data` property.
  const notificationTitle = payload.data.title;
  const notificationOptions = {
    body: payload.data.body,
    icon: payload.data.icon || '/favicon.ico' // Use a default icon if none is provided
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});