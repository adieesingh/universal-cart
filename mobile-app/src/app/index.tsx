import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Redirect } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";
import { api, CartItem } from "../lib/api";
import { useAuth } from "../lib/auth";

const formatPrice = (price: number | null, currency: string | null) =>
  price == null ? "Price unavailable" : `${currency === "INR" || !currency ? "₹" : currency + " "}${price.toLocaleString("en-IN")}`;

export default function Cart() {
  const { token, loading: authLoading, signOut } = useAuth();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);
  const handledIntent = useRef(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const { items } = await api.getItems(token);
      setItems(items);
    } catch (e: any) {
      if (/unauthorized/i.test(e.message)) await signOut();
      else Alert.alert("Couldn't load cart", e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // A link shared from Amazon / Flipkart / any app lands here.
  useEffect(() => {
    if (!hasShareIntent || !token ||  .current) return;
    const text = shareIntent.webUrl ?? shareIntent.text;
    if (!text) {
      resetShareIntent();
      return;
    }
    handledIntent.current = true;
    setAdding(true);
    api
      .addItem(token, text)
      .then(({ duplicate }) => {
        if (duplicate) Alert.alert("Already in your cart", "Updated its details.");
        return load();
      })
      .catch((e) => Alert.alert("Couldn't add item", e.message))
      .finally(() => {
        setAdding(false);
        resetShareIntent();
        handledIntent.current = false;
      });
  }, [hasShareIntent, token]);

  const sections = useMemo(() => {
    const byStore = new Map<string, CartItem[]>();
    for (const it of items) byStore.set(it.store, [...(byStore.get(it.store) ?? []), it]);
    return [...byStore.entries()].map(([title, data]) => ({ title, data }));
  }, [items]);

  const changeQty = async (item: CartItem, delta: number) => {
    const quantity = Math.max(1, Math.min(99, item.quantity + delta));
    if (quantity === item.quantity || !token) return;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, quantity } : i)));
    api.setQuantity(token, item.id, quantity).catch(load);
  };

  const remove = (item: CartItem) => {
    Alert.alert("Remove item?", item.title ?? item.url, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          if (!token) return;
          setItems((prev) => prev.filter((i) => i.id !== item.id));
          api.removeItem(token, item.id).catch(load);
        },
      },
    ]);
  };

  if (authLoading) return <ActivityIndicator style={{ flex: 1 }} />;
  if (!token) return <Redirect href="/login" />;

  return (
    <View style={s.container}>
      {adding && <Text style={s.banner}>Adding to your cart…</Text>}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(i) => i.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
            />
          }
          ListEmptyComponent={
            <Text style={s.empty}>
              Cart is empty.{"\n"}Open Amazon or Flipkart, tap Share on a product, and pick this app.
            </Text>
          }
          renderSectionHeader={({ section }) => <Text style={s.header}>{section.title}</Text>}
          renderItem={({ item }) => (
            <View style={s.row}>
              {item.image ? (
                <Image source={{ uri: item.image }} style={s.image} />
              ) : (
                <View style={[s.image, s.placeholder]} />
              )}
              <View style={{ flex: 1 }}>
                <Text numberOfLines={2} style={s.title}>
                  {item.title ?? item.url}
                </Text>
                <Text style={s.price}>{formatPrice(item.price, item.currency)}</Text>
                <View style={s.actions}>
                  <Pressable onPress={() => changeQty(item, -1)} style={s.qtyBtn}>
                    <Text>−</Text>
                  </Pressable>
                  <Text style={{ minWidth: 20, textAlign: "center" }}>{item.quantity}</Text>
                  <Pressable onPress={() => changeQty(item, 1)} style={s.qtyBtn}>
                    <Text>+</Text>
                  </Pressable>
                  <Pressable onPress={() => Linking.openURL(item.url)} style={{ marginLeft: 12 }}>
                    <Text style={s.link}>Open</Text>
                  </Pressable>
                  <Pressable onPress={() => remove(item)} style={{ marginLeft: 12 }}>
                    <Text style={[s.link, { color: "#c00" }]}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  banner: { backgroundColor: "#fff3cd", padding: 10, textAlign: "center" },
  header: { fontWeight: "700", fontSize: 16, padding: 12, backgroundColor: "#f3f3f3" },
  row: { flexDirection: "row", gap: 12, padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#ddd" },
  image: { width: 72, height: 72, borderRadius: 8, backgroundColor: "#eee" },
  placeholder: { alignItems: "center", justifyContent: "center" },
  title: { fontSize: 14, fontWeight: "500" },
  price: { marginTop: 4, fontWeight: "700" },
  actions: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  qtyBtn: { borderWidth: 1, borderColor: "#ccc", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 2 },
  link: { color: "#0a66c2", fontWeight: "500" },
  empty: { textAlign: "center", marginTop: 80, color: "#666", lineHeight: 22, paddingHorizontal: 32 },
});
