import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface SplashScreenProps {
  onFinish?: () => void;
}

const { height: SCREEN_H } = Dimensions.get('window');

const C = {
  bg: '#0A2540',
  text: '#FFFFFF',
  accent: '#0EA5E9',
};

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  // Invisible square logo (same color as bg = invisible)
  const squareOpacity = useRef(new Animated.Value(0)).current;
  const squareScale = useRef(new Animated.Value(0.9)).current;

  // Text rises from center to top
  const riseUp = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textScale = useRef(new Animated.Value(0.88)).current;

  // Subtitle trails behind
  const subOpacity = useRef(new Animated.Value(0)).current;
  const spinnerOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anims: Animated.CompositeAnimation[] = [];

    // Invisible square logo pulses at center
    const squareAnim = Animated.parallel([
      Animated.timing(squareOpacity, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(squareScale, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    // Text fades in at center
    const textIn = Animated.parallel([
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 500,
        delay: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(textScale, {
        toValue: 1,
        duration: 500,
        delay: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    // Rise up from center to top
    const rise = Animated.timing(riseUp, {
      toValue: 1,
      duration: 900,
      delay: 700,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    });

    // Subtitle fades in after rise
    const sub = Animated.timing(subOpacity, {
      toValue: 1,
      duration: 400,
      delay: 1400,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });

    // Spinner fades in at bottom
    const spinner = Animated.timing(spinnerOpacity, {
      toValue: 1,
      duration: 400,
      delay: 1600,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });

    squareAnim.start();
    textIn.start();
    rise.start();
    sub.start();
    spinner.start();
    anims.push(squareAnim, textIn, rise, sub, spinner);

    const timer = setTimeout(() => onFinish?.(), 2600);
    return () => {
      clearTimeout(timer);
      anims.forEach((a) => a.stop());
    };
  }, [onFinish]);

  const translateY = riseUp.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -SCREEN_H * 0.28],
  });

  return (
    <View style={S.screen}>
      <SafeAreaView style={S.inner} edges={['top', 'bottom']}>
        {/* Invisible square logo — center */}
        <Animated.View
          style={[
            S.squareLogo,
            { opacity: squareOpacity, transform: [{ scale: squareScale }] },
          ]}
        />

        {/* Rising text block */}
        <Animated.View
          style={[
            S.textBlock,
            {
              opacity: textOpacity,
              transform: [{ translateY }, { scale: textScale }],
            },
          ]}
        >
          <Text style={S.nameLine1}>HAMZA</Text>
          <Text style={S.nameLine2}>ALBOSIFY</Text>
          <Animated.Text style={[S.subtitle, { opacity: subOpacity }]}>
            EXCEL GOD MODE
          </Animated.Text>
        </Animated.View>

        {/* Bottom spinner */}
        <Animated.View style={[S.bottom, { opacity: spinnerOpacity }]}>
          <ActivityIndicator size="small" color={C.accent} />
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const S = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Invisible square — same color as bg
  squareLogo: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 28,
    backgroundColor: C.bg,   // exact same as screen background
  },

  // Text block starts at center, rises to top
  textBlock: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },

  nameLine1: {
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: 6,
    color: C.text,
    lineHeight: 52,
    textAlign: 'center',
    includeFontPadding: false,
    marginEnd: -6,
  },
  nameLine2: {
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: 6,
    color: C.text,
    lineHeight: 52,
    textAlign: 'center',
    includeFontPadding: false,
    marginEnd: -6,
    marginTop: -4,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 5,
    color: C.accent,
    marginTop: 12,
    textAlign: 'center',
    includeFontPadding: false,
    marginEnd: -5,
  },

  bottom: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
