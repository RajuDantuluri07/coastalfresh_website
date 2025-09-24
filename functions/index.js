const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

/**
 * Listens for updates on any document in the 'orders' collection.
 * When an order's status changes, it sends a push notification to the user.
 */
exports.onOrderStatusUpdate = functions.firestore
    .document("orders/{orderId}")
    .onUpdate(async (change, context) => {
      const newData = change.after.data();
      const oldData = change.before.data();

      // Exit if status has not changed
      if (newData.status === oldData.status) {
        console.log("Status unchanged. No notification sent.");
        return null;
      }

      const userId = newData.userId;
      if (!userId) {
        console.log("No userId found on order. Cannot send notification.");
        return null;
      }

      // Define notification messages for different statuses
      let messageBody;
      switch (newData.status) {
        case "Accepted":
          messageBody = "Your order has been accepted and is being prepared! 🐟";
          break;
        case "Out for Delivery":
          messageBody = "Your order is out for delivery! 🚚";
          break;
        case "Completed":
          messageBody = "Your order has been delivered. Enjoy your fresh catch! 🎉";
          break;
        case "Cancelled":
          messageBody = "Your order has been cancelled.";
          break;
        default:
          // Don't send notifications for other status changes unless specified
          console.log(`Status changed to '${newData.status}'. No notification configured.`);
          return null;
      }

      // Get the user's FCM tokens from the 'fcmTokens' subcollection
      const tokensSnapshot = await admin.firestore()
          .collection("users").doc(userId).collection("fcmTokens").get();

      if (tokensSnapshot.empty) {
        console.log("No FCM tokens found for user:", userId);
        return null;
      }

      const tokens = tokensSnapshot.docs.map((doc) => doc.id);

      // Construct the notification payload
      const payload = {
        notification: {
          title: "Coastal Fresh Order Update",
          body: messageBody,
          icon: "https://res.cloudinary.com/dpyniai9l/image/upload/v1755523336/Coastal_Fresh_Logo_2_u4xdfa.png",
          badge: "https://res.cloudinary.com/dpyniai9l/image/upload/v1755523336/Coastal_Fresh_Logo_2_u4xdfa.png",
        },
        data: {
          // This URL will be opened when the user clicks the notification
          url: "/profilePage?view=orders",
        },
      };

      // Send the notification to all of the user's registered devices
      const response = await admin.messaging().sendToDevice(tokens, payload);

      // Clean up invalid tokens
      const tokensToRemove = [];
      response.results.forEach((result, index) => {
        const error = result.error;
        if (error) {
          console.error("Failure sending notification to", tokens[index], error);
          // Check for common errors indicating an invalid or unregistered token
          if (
            error.code === "messaging/invalid-registration-token" ||
            error.code === "messaging/registration-token-not-registered"
          ) {
            tokensToRemove.push(tokensSnapshot.docs[index].ref.delete());
          }
        }
      });

      // Wait for all invalid token deletions to complete
      return Promise.all(tokensToRemove);
    });
