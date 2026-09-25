import { Button, Divider, Message, Radio, Space, Switch, Typography } from '@arco-design/web-react';
import { PreviewClose, PreviewOpen, Refresh, ViewGridCard } from '@icon-park/react';
import React, { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { ipcBridge } from '@/common';

const { Title, Text } = Typography;

type PetSize = 200 | 280 | 360;

const SIZE_OPTIONS: { value: PetSize; labelKey: string }[] = [
  { value: 200, labelKey: 'settings.sizeSmall' },
  { value: 280, labelKey: 'settings.sizeMedium' },
  { value: 360, labelKey: 'settings.sizeLarge' },
];

const PetPreview = ({ size }: { size: PetSize }) => {
  const previewSize = size === 200 ? 96 : size === 360 ? 144 : 120;

  return (
    <div className='flex min-h-180px items-center justify-center overflow-hidden rounded-12px bg-fill-1'>
      <img
        src='/pet-states/idle.svg'
        alt=''
        className='object-contain transition-all duration-200 dark:hidden'
        style={{ width: previewSize, height: previewSize }}
      />
      <img
        src='/pet-states/idle-dark.svg'
        alt=''
        className='hidden object-contain transition-all duration-200 dark:block'
        style={{ width: previewSize, height: previewSize }}
      />
    </div>
  );
};

const SettingRow = ({
  title,
  description,
  control,
  testId,
}: {
  title: string;
  description: string;
  control: ReactNode;
  testId?: string;
}) => (
  <div data-testid={testId} className='flex min-w-0 items-center justify-between gap-16px py-10px'>
    <div className='min-w-0 flex-1'>
      <Text className='block font-500'>{title}</Text>
      <Text type='secondary' className='mt-2px block text-12px leading-18px'>
        {description}
      </Text>
    </div>
    <div className='shrink-0'>{control}</div>
  </div>
);

const PetSettings = () => {
  const { t } = useTranslation();
  const petText = (key: string, options?: Record<string, unknown>) => t(`pet.${key}`, options);
  const [enabled, setEnabled] = useState(false);
  const [size, setSize] = useState<PetSize>(280);
  const [dnd, setDnd] = useState(false);
  const [confirmEnabled, setConfirmEnabled] = useState(true);
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const readOptional = <T,>(request: (() => Promise<T>) | undefined, fallback: T) => request?.() ?? fallback;
    void Promise.all([
      ipcBridge.systemSettings.getPetEnabled.invoke(),
      readOptional(ipcBridge.systemSettings.getPetSize?.invoke, 280),
      readOptional(ipcBridge.systemSettings.getPetDnd?.invoke, false),
      readOptional(ipcBridge.systemSettings.getPetConfirmEnabled?.invoke, true),
      readOptional(ipcBridge.systemSettings.getPetAlwaysOnTop?.invoke, true),
    ])
      .then(([nextEnabled, nextSize, nextDnd, nextConfirmEnabled, nextAlwaysOnTop]) => {
        if (!active) return;
        setEnabled(nextEnabled);
        setSize(nextSize as PetSize);
        setDnd(nextDnd);
        setConfirmEnabled(nextConfirmEnabled);
        setAlwaysOnTop(nextAlwaysOnTop);
      })
      .catch((): void => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [t]);

  const update = async (action: () => Promise<unknown>, rollback: () => void) => {
    try {
      await action();
    } catch {
      rollback();
      Message.error(petText('settings.updateFailed'));
    }
  };

  const handleEnabled = (checked: boolean) => {
    const previous = enabled;
    setEnabled(checked);
    void update(
      () => ipcBridge.systemSettings.setPetEnabled.invoke({ enabled: checked }),
      () => setEnabled(previous)
    );
  };

  const handleSize = (value: PetSize) => {
    const previous = size;
    setSize(value);
    void update(
      () => ipcBridge.systemSettings.setPetSize.invoke({ size: value }),
      () => setSize(previous)
    );
  };

  const handleDnd = (checked: boolean) => {
    const previous = dnd;
    setDnd(checked);
    void update(
      () => ipcBridge.systemSettings.setPetDnd.invoke({ dnd: checked }),
      () => setDnd(previous)
    );
  };

  const handleConfirm = (checked: boolean) => {
    const previous = confirmEnabled;
    setConfirmEnabled(checked);
    void update(
      () => ipcBridge.systemSettings.setPetConfirmEnabled.invoke({ enabled: checked }),
      () => setConfirmEnabled(previous)
    );
  };

  const handleAlwaysOnTop = (checked: boolean) => {
    const previous = alwaysOnTop;
    setAlwaysOnTop(checked);
    void update(
      () => ipcBridge.systemSettings.setPetAlwaysOnTop.invoke({ enabled: checked }),
      () => setAlwaysOnTop(previous)
    );
  };

  const runAction = async (action: () => Promise<unknown>, successKey: string) => {
    try {
      await action();
      Message.success(t(successKey));
    } catch {
      Message.error(petText('settings.updateFailed'));
    }
  };

  return (
    <div className='h-full overflow-y-auto p-24px'>
      <div className='mx-auto max-w-900px'>
        <div className='mb-20px flex items-start gap-12px'>
          <div className='flex size-42px shrink-0 items-center justify-center rounded-12px bg-primary-light-1 text-primary'>
            <ViewGridCard size={22} />
          </div>
          <div>
            <Title heading={5} className='!mb-4px !mt-0'>
              {petText('settings.title')}
            </Title>
            <Text type='secondary'>{petText('settings.description')}</Text>
          </div>
        </div>

        <div className='grid grid-cols-1 gap-20px lg:grid-cols-[minmax(240px,3fr)_minmax(0,5fr)]'>
          <div>
            <PetPreview size={size} />
            <Space wrap className='mt-12px w-full'>
              <Button
                icon={<PreviewOpen />}
                disabled={!enabled}
                onClick={() => void runAction(() => ipcBridge.systemSettings.showPet.invoke(), 'settings.shown')}
              >
                {petText('settings.show')}
              </Button>
              <Button
                icon={<PreviewClose />}
                disabled={!enabled}
                onClick={() => void runAction(() => ipcBridge.systemSettings.hidePet.invoke(), 'settings.hidden')}
              >
                {petText('settings.hide')}
              </Button>
              <Button
                icon={<Refresh />}
                disabled={!enabled}
                onClick={() =>
                  void runAction(() => ipcBridge.systemSettings.resetPetPosition.invoke(), 'settings.positionReset')
                }
              >
                {petText('settings.resetPosition')}
              </Button>
            </Space>
          </div>

          <div>
            <div className='rounded-12px border border-border-2 bg-bg-2 px-16px py-6px'>
              <SettingRow
                testId='row-pet.enable'
                title={petText('settings.enable')}
                description={petText('settings.enableDescription')}
                control={<Switch loading={loading} disabled={loading} checked={enabled} onChange={handleEnabled} />}
              />
              <Divider className='!my-0' />
              <SettingRow
                title={petText('settings.alwaysOnTop')}
                description={petText('settings.alwaysOnTopDescription')}
                control={<Switch disabled={!enabled} checked={alwaysOnTop} onChange={handleAlwaysOnTop} />}
              />
              <Divider className='!my-0' />
              <SettingRow
                title={petText('settings.confirm')}
                description={petText('settings.confirmDescription')}
                control={<Switch disabled={!enabled} checked={confirmEnabled} onChange={handleConfirm} />}
              />
              <Divider className='!my-0' />
              <SettingRow
                title={petText('settings.dnd')}
                description={petText('settings.dndDescription')}
                control={<Switch disabled={!enabled} checked={dnd} onChange={handleDnd} />}
              />
            </div>

            <div className='mt-16px rounded-12px border border-border-2 bg-bg-2 p-16px'>
              <Text className='mb-8px block font-500'>{petText('settings.size')}</Text>
              <Radio.Group
                type='button'
                value={size}
                disabled={!enabled}
                onChange={(value) => handleSize(value as PetSize)}
              >
                {SIZE_OPTIONS.map((option) => (
                  <Radio key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </Radio>
                ))}
              </Radio.Group>
              <Text type='secondary' className='mt-8px block text-12px'>
                {petText('settings.sizeDescription')}
              </Text>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PetSettings;
