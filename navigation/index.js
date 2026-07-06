import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { DesignsScreen } from "../screens/DesignsScreen";
import { CreateScreen } from "../screens/CreateScreen";
import { AccountScreen } from "../screens/AccountScreen";
import { colors, shadow } from "../utils/theme";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TAB_ICONS = {
    Designs: { active: "grid", inactive: "grid-outline" },
    Create: { active: "add-circle", inactive: "add-circle-outline" },
    Account: { active: "person", inactive: "person-outline" },
};

const HomeTabs = () => {
    return (
        <Tab.Navigator
            initialRouteName="Designs"
            screenOptions={({ route }) => ({
                headerShown: false,
                tabBarActiveTintColor: colors.primary,
                tabBarInactiveTintColor: colors.textFaint,
                tabBarStyle: {
                    backgroundColor: colors.surface,
                    borderTopWidth: 0,
                    ...shadow.floating,
                },
                tabBarLabelStyle: {
                    fontSize: 11,
                    fontWeight: "600",
                },
                tabBarIcon: ({ color, size, focused }) => {
                    const icons = TAB_ICONS[route.name];
                    const name = focused ? icons.active : icons.inactive;
                    return <Ionicons name={name} size={size} color={color} />;
                },
            })}
        >
            <Tab.Screen name="Designs" component={DesignsScreen} />
            <Tab.Screen name="Create" component={CreateScreen} />
            <Tab.Screen name="Account" component={AccountScreen} />
        </Tab.Navigator>
    );
};

const RootNavigator = () => {
    return (
        <Stack.Navigator
            initialRouteName={"HomeScreen"}
            screenOptions={{
                headerShown: false,
                animation: "fade",
                contentStyle: { backgroundColor: colors.background },
            }}
        >
            <Stack.Screen name="HomeScreen" component={HomeTabs} />
        </Stack.Navigator>
    );
};

export default RootNavigator;
