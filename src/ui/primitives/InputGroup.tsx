import { forwardRef } from 'react';
import { Input, type InputProps } from './Input';
import styles from './InputGroup.module.css';

export interface InputGroupProps extends InputProps {
  unit?: string;
  inputClassName?: string;
  unitClassName?: string;
}

export const InputGroup = forwardRef<HTMLInputElement, InputGroupProps>(
  function InputGroup(
    { unit, className = '', inputClassName = '', unitClassName = '', ...props },
    ref
  ) {
    return (
      <div className={`${styles.inputGroup} ${className}`.trim()}>
        <Input {...props} ref={ref} className={inputClassName} />
        {unit && <span className={`${styles.inputUnit} ${unitClassName}`.trim()}>{unit}</span>}
      </div>
    );
  }
);

export default InputGroup;
