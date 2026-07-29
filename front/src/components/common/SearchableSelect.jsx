"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import styles from "./SearchControl.module.css";

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

function normalizeKana(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u30A1-\u30F6]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0x60)
    )
    .toLowerCase()
    .trim();
}

function defaultGetValue(option) {
  return option?.value ?? option?.id ?? "";
}

function defaultGetLabel(option) {
  return option?.label ?? option?.name ?? "";
}

function defaultGetSearchText(option) {
  return [defaultGetLabel(option), option?.name_en, option?.label_en]
    .filter(Boolean)
    .join(" ");
}

function defaultGetDescription() {
  return "";
}

export default function SearchableSelect({
  value = "",
  onChange,
  options = [],
  disabled = false,
  placeholder = "",
  emptyText = "候補がありません",
  getOptionValue = defaultGetValue,
  getOptionLabel = defaultGetLabel,
  getOptionSearchText = defaultGetSearchText,
  getOptionDescription = defaultGetDescription,
  sortOptions,
  maxResults = 30,
  allowCustomValue = false,
  selectOnFocus = false,
  className = "",
  inputClassName = "",
  ariaLabel,
}) {
  const rootRef = useRef(null);
  const listboxId = useId();

  const [inputValue, setInputValue] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const selectedOption = useMemo(
    () =>
      options.find(
        (option) => String(getOptionValue(option)) === String(value)
      ) ?? null,
    [getOptionValue, options, value]
  );

  useEffect(() => {
    if (open) return;

    if (selectedOption) {
      setInputValue(String(getOptionLabel(selectedOption)));
      return;
    }

    setInputValue(allowCustomValue ? String(value ?? "") : "");
  }, [allowCustomValue, getOptionLabel, open, selectedOption, value]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

  const filteredOptions = useMemo(() => {
    const keyword = normalizeKana(inputValue);
    const base = sortOptions ? [...options].sort(sortOptions) : [...options];

    const matched = keyword
      ? base.filter((option) =>
          normalizeKana(getOptionSearchText(option)).includes(keyword)
        )
      : base;

    return matched.slice(0, maxResults);
  }, [
    getOptionSearchText,
    inputValue,
    maxResults,
    options,
    sortOptions,
  ]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [inputValue, open]);

  function selectAll(event) {
    if (!selectOnFocus || disabled) return;

    event.currentTarget.select();
  }

  function handleSelect(option) {
    if (!option) return;

    const nextValue = String(getOptionValue(option));
    const nextLabel = String(getOptionLabel(option));

    setInputValue(nextLabel);
    onChange?.(nextValue, option, { reason: "select" });
    setOpen(false);
    setHighlightedIndex(0);
  }

  function handleInputChange(next) {
    setInputValue(next);
    setOpen(true);

    if (!next.trim()) {
      onChange?.("", null, { reason: "input" });
      return;
    }

    const normalizedNext = normalizeKana(next);

    const exact = options.find((option) => {
      const label = String(getOptionLabel(option));
      const optionValue = String(getOptionValue(option));

      return (
        normalizeKana(label) === normalizedNext ||
        normalizeKana(optionValue) === normalizedNext
      );
    });

    if (allowCustomValue) {
      onChange?.(next, exact ?? null, { reason: "input" });
      return;
    }

    if (exact) {
      onChange?.(String(getOptionValue(exact)), exact, { reason: "input" });
    } else {
      onChange?.("", null, { reason: "input" });
    }
  }

  function handleKeyDown(event) {
    // 日本語変換中のEnterでは候補を確定しない。
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);

      setHighlightedIndex((current) =>
        Math.min(
          current + 1,
          Math.max(filteredOptions.length - 1, 0)
        )
      );

      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setHighlightedIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      if (filteredOptions.length === 0) {
        return;
      }

      event.preventDefault();

      const selectedOption =
        filteredOptions[highlightedIndex] ?? filteredOptions[0];

      handleSelect(selectedOption);
      return;
    }

    if (event.key === "Escape") {
      setOpen(false);
      setHighlightedIndex(0);
    }
  }

  return (
    <div ref={rootRef} className={cn(styles.root, className)}>
      <input
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        value={inputValue}
        onChange={(event) => handleInputChange(event.target.value)}
        onFocus={(event) => {
          if (disabled) return;

          setOpen(true);
          selectAll(event);
        }}
        onClick={selectAll}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          styles.input,
          open && styles.inputOpen,
          inputClassName
        )}
      />

      {open && !disabled ? (
        <div id={listboxId} className={styles.dropdown} role="listbox">
          {filteredOptions.length === 0 ? (
            <div className={styles.empty}>{emptyText}</div>
          ) : (
            filteredOptions.map((option, index) => {
              const optionValue = String(getOptionValue(option));
              const active = optionValue === String(value);
              const description = getOptionDescription(option);

              return (
                <button
                  key={`${optionValue}-${index}`}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => handleSelect(option)}
                  className={cn(
                    styles.option,
                    active && styles.optionActive,
                    index === highlightedIndex && styles.optionHighlighted
                  )}
                >
                  <span className={styles.optionContent}>
                    <span className={styles.optionLabel}>
                      {getOptionLabel(option)}
                    </span>

                    {description ? (
                      <span className={styles.optionDescription}>
                        {description}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
