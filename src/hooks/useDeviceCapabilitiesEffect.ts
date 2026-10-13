import { useEffect, useMemo, useRef } from 'react';

import { Bool, DeviceSettingsParams } from 'api';
import useApi from 'hooks/useApi';
import useApiMutation from 'hooks/useApiMutation';
import useStorageState from 'hooks/useStorageState';

import { logException } from 'utils/logging';

function useDeviceCapabilitiesEffect() {
  const [isLogged] = useStorageState<boolean>('is_logged');
  const { data: deviceInfo } = useApi('deviceInfo', [], { enabled: Boolean(isLogged) });
  const { saveDeviceSettingsAsync } = useApiMutation('saveDeviceSettings');
  const hasSyncedRef = useRef(false);

  const capabilities = useMemo(() => {
    const video = document.createElement('video');
    const supportHevc = video.canPlayType('video/mp4; codecs="hvc1"') !== '' || video.canPlayType('video/mp4; codecs="hev1"') !== '';
    // ponytail: HDR needs 10-bit color, which on webOS implies HEVC decode, so it just tracks HEVC
    const supportHdr = supportHevc;
    const support4k = Math.max(window.screen.width, window.screen.height) * (window.devicePixelRatio || 1) >= 3840;

    return { supportSsl: true, supportHevc, supportHdr, support4k };
  }, []);

  useEffect(() => {
    const device = deviceInfo?.device;
    const settings = device?.settings;

    if (!device || !settings || hasSyncedRef.current) {
      return;
    }
    hasSyncedRef.current = true;

    const diffs: DeviceSettingsParams = {};
    if (capabilities.supportSsl !== (settings.supportSsl.value === Bool.True)) {
      diffs.supportSsl = capabilities.supportSsl;
    }
    if (capabilities.supportHevc !== (settings.supportHevc.value === Bool.True)) {
      diffs.supportHevc = capabilities.supportHevc;
    }
    if (capabilities.supportHdr !== (settings.supportHdr.value === Bool.True)) {
      diffs.supportHdr = capabilities.supportHdr;
    }
    if (capabilities.support4k !== (settings.support4k.value === Bool.True)) {
      diffs.support4k = capabilities.support4k;
    }

    if (Object.keys(diffs).length === 0) {
      return;
    }

    (async () => {
      try {
        await saveDeviceSettingsAsync([device.id, diffs]);
      } catch (ex) {
        logException(ex);
      }
    })();
  }, [capabilities, deviceInfo, saveDeviceSettingsAsync]);
}

export default useDeviceCapabilitiesEffect;
