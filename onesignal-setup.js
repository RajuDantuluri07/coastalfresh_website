/*
  This file contains the setup and initialization logic for the OneSignal Web Push SDK.
  It is loaded by index.html to configure push notifications for the website.
*/

function initOneSignal(currentUser) {
  // Ensure the OneSignal SDK is ready
  window.OneSignalDeferred = window.OneSignalDeferred || [];

  OneSignalDeferred.push(async function(OneSignal) {
    // Initialize OneSignal
    await OneSignal.init({
      appId: "e2939260-7605-4b71-8042-2e822e89ca67",
      allowLocalhostAsSecureOrigin: true, // Useful for local development
    });

    // If a user is already logged in when OneSignal initializes,
    // identify them to OneSignal immediately. This handles cases where
    // auth state is resolved before OneSignal is ready.
    if (currentUser && currentUser.uid) {
      await OneSignal.login(currentUser.uid);
      console.log('OneSignal user identified on init:', currentUser.uid);
    }

    // Add a listener for notification permission changes
    OneSignal.Notifications.addEventListener('permissionChange', (permission) => {
      console.log("OneSignal push permission state is now:", permission);

      // When a user grants permission, tag them to receive a welcome notification.
      // This tag can be used to trigger an automated message from the OneSignal dashboard.
      if (permission === 'granted') {
        OneSignal.User.addTag("just_subscribed", "true");
        console.log("User tagged for welcome notification.");
        if (typeof gtag === 'function') {
          gtag('event', 'push_subscription_success');
        }
      }

      // Track the permission change event in Google Analytics
      if (typeof gtag === 'function') {
          gtag('event', 'push_permission_change', { 'permission_state': permission });
      }
    });
  });
}