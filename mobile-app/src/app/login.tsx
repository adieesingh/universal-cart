import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function Login() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (mode: "login" | "register") => {
    setBusy(true);
    setError(null);
    try {
      const { token } = await (mode === "login" ? api.login : api.register)(email.trim(), password);
      await signIn(token);
      router.replace("/");
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.container}>
      <TextInput
        style={s.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={s.input}
        placeholder="Password (6+ characters)"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error && <Text style={s.error}>{error}</Text>}
      {busy ? (
        <ActivityIndicator />
      ) : (
        <>
          <Pressable style={s.primary} onPress={() => submit("login")}>
            <Text style={s.primaryText}>Sign in</Text>
          </Pressable>
          <Pressable style={s.secondary} onPress={() => submit("register")}>
            <Text style={s.secondaryText}>Create account</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12, justifyContent: "center" },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  primary: { backgroundColor: "#111", padding: 14, borderRadius: 8, alignItems: "center" },
  primaryText: { color: "#fff", fontWeight: "600" },
  secondary: { padding: 14, alignItems: "center" },
  secondaryText: { color: "#111" },
  error: { color: "#c00" },
});
