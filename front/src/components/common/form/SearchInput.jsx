"use client";

import styles from "./SearchControl.module.css";

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

export default function SearchInput({
  value = "",
  onChange,
  placeholder = "",
  disabled = false,
  selectOnFocus = false,
  className = "",
  inputClassName = "",
  onFocus,
  onClick,
  ...inputProps
}) {
  function selectAll(event) {
    if (!selectOnFocus || disabled) return;
    event.currentTarget.select();
  }

  return (
    <div className={cn(styles.root, className)}>
      <input
        {...inputProps}
        type="text"
        value={value}
        onChange={(event) => onChange?.(event.target.value, event)}
        onFocus={(event) => {
          selectAll(event);
          onFocus?.(event);
        }}
        onClick={(event) => {
          selectAll(event);
          onClick?.(event);
        }}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(styles.input, inputClassName)}
      />
    </div>
  );
}
