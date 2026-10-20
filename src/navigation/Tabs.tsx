import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import { View } from 'react-native';

import { Avatar } from '../components/Avatar';
import GamesScreen from '../screens/GamesScreen';
import HomeScreen from '../screens/HomeScreen';
import MyNetflixScreen from '../screens/MyNetflixScreen';
import NewHotScreen from '../screens/NewHotScreen';
import { useApp } from '../state/AppState';
import { colors, font } from '../theme/tokens';
import type { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

function ProfileTabIcon({ focused }: { focused: boolean }) {
  const { activeProfile } = useApp();
  if (!activeProfile) return <Ionicons name="person-circle-outline" size={26} color={focused ? colors.text : colors.textDim} />;
  return (
    <View style={{ padding: 1.5, borderRadius: 5, borderWidth: 1.5, borderColor: focused ? colors.text : 'transparent' }}>
      <Avatar profile={activeProfile} size={22} radius={3} />
    </View>
  );
}

export function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textDim,
        tabBarStyle: { backgroundColor: 'rgba(0,0,0,0.97)', borderTopWidth: 0, elevation: 0 },
        tabBarLabelStyle: { fontFamily: font.medium, fontSize: 10 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarIcon: ({ focused, color }) => <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} /> }}
      />
      <Tab.Screen
        name="Games"
        component={GamesScreen}
        options={{ tabBarIcon: ({ focused, color }) => <Ionicons name={focused ? 'game-controller' : 'game-controller-outline'} size={26} color={color} /> }}
      />
      <Tab.Screen
        name="NewHot"
        component={NewHotScreen}
        options={{
          title: 'New & Hot',
          tabBarIcon: ({ focused, color }) => (
            <MaterialCommunityIcons name={focused ? 'play-box-multiple' : 'play-box-multiple-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="MyNetflix"
        component={MyNetflixScreen}
        options={{ title: 'My MythTube', tabBarIcon: ({ focused }) => <ProfileTabIcon focused={focused} /> }}
      />
    </Tab.Navigator>
  );
}
