import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabase';
import { colors } from '../lib/colors';

export default function Index() {
  const { session, loading } = useAuthStore();
  const [checking, setChecking] = useState(true);
  const [onboarded, setOnboarded] = useState(false);

  useEffect(() => {
    if (!session) { setChecking(false); return; }
    supabase
      .from('profiles')
      .select('onboarding_complete')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        setOnboarded(data?.onboarding_complete ?? false);
        setChecking(false);
      });
  }, [session]);

  if (loading || checking) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.black, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={colors.white} />
      </View>
    );
  }

  if (!session) return <Redirect href="/(auth)/welcome" />;
  if (!onboarded) return <Redirect href="/onboarding/mode" />;
  return <Redirect href="/(tabs)/today" />;
}
