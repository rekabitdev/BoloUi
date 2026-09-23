/**
 * @license
 * Copyright 2025 BoloUi (boloui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import LocalAgents from '@/renderer/pages/settings/AgentSettings/LocalAgents';
import BoloScrollArea from '@/renderer/components/base/BoloScrollArea';
import { useSettingsViewMode } from '../settingsViewContext';

const AgentModalContent: React.FC = () => {
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';

  return (
    <div className='flex flex-col h-full w-full'>
      <BoloScrollArea className='flex-1 min-h-0 pb-16px scrollbar-hide' disableOverflow={isPageMode}>
        <LocalAgents />
      </BoloScrollArea>
    </div>
  );
};

export default AgentModalContent;
