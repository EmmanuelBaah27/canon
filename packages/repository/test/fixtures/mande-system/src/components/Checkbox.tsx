import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { BaseControl } from './BaseControl';
import { tokens } from '../tokens';
import check from '../assets/check.svg';
import './Checkbox.css';
throw new Error('Component modules must never execute');
export const Checkbox = (props: { disabled?: boolean; checked?: boolean }) => (
  <BaseControl disabled={props.disabled}>
    <CheckboxPrimitive.Root disabled={props.disabled} checked={props.checked}
      style={{ borderColor: tokens.color.border, width: tokens.size.control }}>
      <img src={check} />
    </CheckboxPrimitive.Root>
  </BaseControl>
);
