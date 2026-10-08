import { ChevronDownIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Menu, MenuCheckboxItem, MenuPopup, MenuTrigger } from "~/components/ui/menu";

/** Write-only token field: the saved value is never shown, only whether one exists. */
export function SecretTokenInput(props: {
  readonly id: string;
  readonly isSaved: boolean;
  readonly draft: string;
  readonly onDraftChange: (value: string) => void;
}) {
  return (
    <Input
      id={props.id}
      type="password"
      autoComplete="off"
      size="sm"
      placeholder={props.isSaved ? "Stored secret, enter a new value to replace" : "Not set"}
      value={props.draft}
      onChange={(event) => props.onDraftChange(event.target.value)}
    />
  );
}

export interface MultiSelectOption {
  readonly value: string;
  readonly label: string;
}

/**
 * `selected` carries each stored value with its stored label, so a mapping that is no longer in
 * the loaded `options` still renders (marked unavailable) and can be unchecked.
 */
export function MultiSelectMenu(props: {
  readonly ariaLabel: string;
  readonly options: ReadonlyArray<MultiSelectOption>;
  readonly selected: ReadonlyArray<MultiSelectOption>;
  readonly placeholder: string;
  readonly disabled?: boolean;
  readonly onChange: (selected: ReadonlyArray<string>) => void;
}) {
  const selectedValues = props.selected.map((option) => option.value);
  const selected = new Set(selectedValues);
  const available = new Set(props.options.map((option) => option.value));
  // Options are not loaded while disabled, so nothing can be called unavailable yet.
  const missing = props.disabled
    ? []
    : props.selected
        .filter((option) => !available.has(option.value))
        .map((option) => ({ value: option.value, label: `${option.label} (unavailable)` }));
  const items = [...props.options, ...missing];
  const labels = items.filter((option) => selected.has(option.value)).map((option) => option.label);
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            size="sm"
            variant="outline"
            aria-label={props.ariaLabel}
            disabled={props.disabled}
          >
            <span className="max-w-48 truncate">
              {labels.length > 0 ? labels.join(", ") : props.placeholder}
            </span>
            <ChevronDownIcon className="size-3.5" />
          </Button>
        }
      />
      <MenuPopup align="end">
        {items.map((option) => (
          <MenuCheckboxItem
            key={option.value}
            checked={selected.has(option.value)}
            onCheckedChange={(checked) =>
              props.onChange(
                checked
                  ? [...selectedValues, option.value]
                  : selectedValues.filter((value) => value !== option.value),
              )
            }
          >
            {option.label}
          </MenuCheckboxItem>
        ))}
      </MenuPopup>
    </Menu>
  );
}

/** Save and Remove for a tracker's credential row; Remove only shows while a token is saved. */
export function CredentialButtons(props: {
  readonly saving: boolean;
  readonly canSave: boolean;
  readonly isSaved: boolean;
  readonly onSave: () => void;
  readonly onRemove: () => void;
}) {
  return (
    <>
      <Button size="sm" disabled={props.saving || !props.canSave} onClick={props.onSave}>
        Save
      </Button>
      {props.isSaved ? (
        <Button size="sm" variant="ghost" disabled={props.saving} onClick={props.onRemove}>
          Remove
        </Button>
      ) : null}
    </>
  );
}
