import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import AppSettingsScreen from '../screens/AppSettingsScreen';
import CategoriesScreen from '../screens/CategoriesScreen';
import DownloadsScreen from '../screens/DownloadsScreen';
import LandingScreen from '../screens/LandingScreen';
import MyListScreen from '../screens/MyListScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import PlayerScreen from '../screens/PlayerScreen';
import SearchScreen from '../screens/SearchScreen';
import SignInScreen from '../screens/SignInScreen';
import SignUpScreen from '../screens/SignUpScreen';
import SplashScreen from '../screens/SplashScreen';
import TitleScreen from '../screens/TitleScreen';
import { colors } from '../theme/tokens';
import { Tabs } from './Tabs';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Splash"
      screenOptions={{
        headerShown: false,
        orientation: 'portrait_up',
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="Splash" component={SplashScreen} options={{ animation: 'none' }} />
      <Stack.Screen name="Landing" component={LandingScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="SignIn" component={SignInScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
      <Stack.Screen name="Main" component={Tabs} options={{ animation: 'fade' }} />
      <Stack.Screen name="Title" component={TitleScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen
        name="Player"
        component={PlayerScreen}
        options={{ orientation: 'landscape', animation: 'fade', navigationBarHidden: true, statusBarHidden: true }}
      />
      <Stack.Screen name="Search" component={SearchScreen} options={{ animation: 'fade' }} />
      <Stack.Screen
        name="Categories"
        component={CategoriesScreen}
        options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }}
      />
      <Stack.Screen name="MyList" component={MyListScreen} />
      <Stack.Screen name="Downloads" component={DownloadsScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="AppSettings" component={AppSettingsScreen} />
    </Stack.Navigator>
  );
}
