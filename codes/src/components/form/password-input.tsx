'use client';

import { Eye, EyeOff } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { id } from '@/i18n/id';

/** Input password dengan toggle tampil/sembunyi (design-system 5.2). */
export const PasswordInput = React.forwardRef<HTMLInputElement, Omit<React.ComponentProps<'input'>, 'type'>>(
  function PasswordInput(props, ref) {
    const [shown, setShown] = React.useState(false);
    return (
      <div className="relative">
        <Input ref={ref} {...props} type={shown ? 'text' : 'password'} className="pr-12" />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute top-1 right-1 size-9"
          aria-label={shown ? id.form.hidePassword : id.form.showPassword}
          aria-pressed={shown}
          onClick={() => setShown((s) => !s)}
        >
          {shown ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </Button>
      </div>
    );
  },
);
