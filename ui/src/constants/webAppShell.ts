import { Dimensions, Platform, type ScaledSize } from 'react-native';
import { WEB_APP_MAX_WIDTH } from './webAppMaxWidth';

export { WEB_APP_MAX_WIDTH };

function capSize(size: ScaledSize): ScaledSize {
  if (size.width <= WEB_APP_MAX_WIDTH) return size;
  return { ...size, width: WEB_APP_MAX_WIDTH };
}

if (Platform.OS === 'web') {
  const originalGet = Dimensions.get.bind(Dimensions);
  Dimensions.get = ((dim: 'window' | 'screen') => capSize(originalGet(dim))) as typeof Dimensions.get;

  const originalAdd = Dimensions.addEventListener.bind(Dimensions);
  Dimensions.addEventListener = ((event, handler) => {
    if (event !== 'change') return originalAdd(event, handler);
    return originalAdd(event, (e) => {
      handler({
        window: capSize(e.window),
        screen: capSize(e.screen),
      });
    });
  }) as typeof Dimensions.addEventListener;
}
