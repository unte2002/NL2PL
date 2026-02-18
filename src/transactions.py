from typing import Any, Dict, List, Callable
import datetime as _dt


def validate_transaction(transaction: Dict[str, Any]) -> Dict[str, Any]:
    errors: List[str] = []
    valid: bool = True

    # Validate amount
    amount = transaction.get("amount")
    if amount is None:
        errors.append("amount is required")
        valid = False
    else:
        try:
            amount_value = float(amount)
        except (TypeError, ValueError):
            errors.append("amount must be a number")
            valid = False
        else:
            if amount_value <= 0:
                errors.append("amount must be greater than 0")
                valid = False

    # Validate date
    date_value = transaction.get("date")
    if date_value is None:
        errors.append("date is required")
        valid = False
    else:
        if not isinstance(date_value, (_dt.date, _dt.datetime)):
            try:
                _dt.date.fromisoformat(str(date_value))
            except Exception:
                errors.append("date is not a valid date")
                valid = False

    # Validate account_id existence
    account_id = transaction.get("account_id")
    if account_id is None:
        errors.append("account_id is required")
        valid = False
    else:
        exists = False
        account_exists_callable: Callable[[Any], bool] = transaction.get("account_exists")
        if callable(account_exists_callable):
            try:
                exists = bool(account_exists_callable(account_id))
            except Exception:
                exists = False
        else:
            db = transaction.get("db")
            if db is not None and hasattr(db, "cursor"):
                try:
                    cur = db.cursor()
                    cur.execute("SELECT 1 FROM accounts WHERE id = %s", (account_id,))
                    exists = cur.fetchone() is not None
                except Exception:
                    exists = False
            else:
                errors.append("account existence could not be verified (no db handler or callback provided)")
                valid = False

        if not exists:
            errors.append(f"account with id {account_id} does not exist")
            valid = False

    return {"valid": valid, "errors": errors}