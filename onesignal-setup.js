/*
  This file contains the setup and initialization logic for the OneSignal Web Push SDK.
  It is loaded by index.html to configure push notifications for the website.
*/

function initOneSignal() {
  // Ensure the OneSignal SDK is ready
  window.OneSignalDeferred = window.OneSignalDeferred || [];

  OneSignalDeferred.push(async function(OneSignal) {
    // Initialize OneSignal
    await OneSignal.init({
      appId: "e2939260-7605-4b71-8042-2e822e89ca67",
      allowLocalhostAsSecureOrigin: true, // Useful for local development
      // This tells OneSignal to wait for an explicit login call
      // before associating the user. It's the correct approach
      // when you manage user login/logout in your app.
      requiresUserPrivacyConsent: false,
    });

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