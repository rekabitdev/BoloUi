/**
 * @license
 * Copyright 2026 BoloUi (boloui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { Tooltip } from '@arco-design/web-react';
import { FolderOpen } from '@icon-park/react';
import classNames from 'classnames';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';

interface Props {
  isMobile: boolean;
  isActive: boolean;
  collapsed: boolean;
  siderTooltipProps: SiderTooltipProps;
  onClick: () => void;
}

const SiderProjectsEntry: React.FC<Props> = ({
  isMobile,
  isActive,
  collapsed,
  siderTooltipProps,
  onClick,
}) => {
  const icon = <FolderOpen theme='outline' size={collapsed ? 20 : 16} fill='currentColor' />;
  if (collapsed) {
    return (
      <Tooltip {...siderTooltipProps} content='Projects' position='right'>
        <div
          className={classNames(
            'w-full h-34px flex items-center justify-center cursor-pointer transition-colors rd-8px text-t-primary',
            isActive ? 'bg-fill-3' : 'hover:bg-fill-3 active:bg-fill-4'
          )}
          onClick={onClick}
        >
          {icon}
        </div>
      </Tooltip>
    );
  }

  return (
    <Tooltip {...siderTooltipProps} content='Projects' position='right'>
      <div
        className={classNames(
          'box-border group h-34px w-full flex items-center justify-start gap-8px ps-10px pe-8px rd-0.5rem cursor-pointer shrink-0 transition-all text-t-primary',
          isMobile && 'sider-action-btn-mobile',
          isActive ? 'bg-fill-3' : 'hover:bg-fill-3 active:bg-fill-4'
        )}
        onClick={onClick}
      >
        <span className='size-22px flex items-center justify-center shrink-0 text-t-primary'>{icon}</span>
        <span className='collapsed-hidden text-t-primary text-14px font-[500] leading-24px'>Projects</span>
      </div>
    </Tooltip>
  );
};

export default SiderProjectsEntry;
