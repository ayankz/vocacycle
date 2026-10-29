import { View, Text } from 'react-native';

export default function VocabularyScreen() {
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
                Vocabulary
            </Text>
        </View>
    );
}