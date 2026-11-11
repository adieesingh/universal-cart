import { Stack } from "expo-router";
import { ShareIntentProvider } from "expo-share-intent";
import { AuthProvider } from "../lib/auth";

export default function RootLayout() {
  return (
    <ShareIntentProvider>
      <AuthProvider>
        <Stack screenOptions={{ headerTitleAlign: "center" }}>
          <Stack.Screen name="index" options={{ title: "My Cart" }} />
          <Stack.Screen name="login" options={{ title: "Sign in" }} />
        </Stack>
      </AuthProvider>
    </ShareIntentProvider>
  );
}
