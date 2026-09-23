/**
 * @license
 * Copyright 2025 BoloUi (boloui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * BoloUi 基础组件库统一导出 / BoloUi base components unified exports
 *
 * 提供所有基础组件和类型的统一导出入口
 * Provides unified export entry for all base components and types
 */

// ==================== 组件导出 / Component Exports ====================

export { default as BoloModal } from './BoloModal';
export { default as BoloCollapse } from './BoloCollapse';
export { default as BoloSelect } from './BoloSelect';
export { default as BoloScrollArea } from './BoloScrollArea';
export { default as BoloSteps } from './BoloSteps';
export { default as BoloSearchInput } from './BoloSearchInput';
export { default as BoloInlineSearchInput } from './BoloInlineSearchInput';

// ==================== 类型导出 / Type Exports ====================

// BoloModal 类型 / BoloModal types
export type {
  ModalSize,
  ModalHeaderConfig,
  ModalFooterConfig,
  ModalContentStyleConfig,
  BoloModalProps,
} from './BoloModal';
export { MODAL_SIZES } from './BoloModal';

// BoloCollapse 类型 / BoloCollapse types
export type { BoloCollapseProps, BoloCollapseItemProps } from './BoloCollapse';

// BoloSelect 类型 / BoloSelect types
export type { BoloSelectProps } from './BoloSelect';

// BoloSteps 类型 / BoloSteps types
export type { BoloStepsProps } from './BoloSteps';

// BoloSearchInput 类型 / BoloSearchInput types
export type { BoloSearchInputProps } from './BoloSearchInput';

// BoloInlineSearchInput 类型 / BoloInlineSearchInput types
export type { BoloInlineSearchInputProps } from './BoloInlineSearchInput';
