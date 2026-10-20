import { useNavigation, type NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type TabParamList = {
  Home: { genre?: string } | undefined;
  TV: undefined;
  NewHot: undefined;
  MyNetflix: undefined;
};

export type RootStackParamList = {
  Splash: undefined;
  Landing: undefined;
  SignIn: undefined;
  SignUp: undefined;
  Main: NavigatorScreenParams<TabParamList> | undefined;
  Title: { id: string };
  Player: { id: string; episodeId?: string };
  Live: { channelId: string; filter?: string };
  Search: undefined;
  Categories: { current?: string } | undefined;
  MyList: undefined;
  Downloads: undefined;
  Notifications: undefined;
  AppSettings: undefined;
  // Dedicated Adult Content screen (requirement 9)
  AdultContent: undefined;
};

export type RootNav = NativeStackNavigationProp<RootStackParamList>;

export function useRootNav(): RootNav {
  return useNavigation<RootNav>();
}
