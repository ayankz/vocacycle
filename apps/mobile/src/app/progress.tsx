import { Text, View } from 'react-native';

export default function ProgressScreen() {
    return (
        <View
            style={{
                flex: 1,
                backgroundColor: '#111827',
                justifyContent: 'center',
                alignItems: 'center',
            }}
        >
            <Text style={{ color: '#FFFFFF', fontSize: 24 }}>
                Progress
            </Text>
        </View>
    );
}