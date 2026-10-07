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

export function MultiSelectMenu(props: {
  readonly ariaLabel: string;
  readonly options: ReadonlyArray<MultiSelectOption>;
  readonly selected: ReadonlyArray<string>;
  readonly placeholder: string;
  readonly disabled?: boolean;
  readonly onChange: (selected: ReadonlyArray<string>) => void;
}) {
  const selected = new Set(props.selected);
  const labels = props.options
    .filter((option) => selected.has(option.value))
    .map((option) => option.label);
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
        {props.options.map((option) => (
          <MenuCheckboxItem
            key={option.value}
            checked={selected.has(option.value)}
            onCheckedChange={(checked) =>
              props.onChange(
                checked
                  ? [...props.selected, option.value]
                  : props.selected.filter((value) => value !== option.value),
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
