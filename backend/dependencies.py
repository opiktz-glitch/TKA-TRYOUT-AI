from fastapi import Depends, HTTPException, status

from fastapi.security import OAuth2PasswordBearer

from sqlalchemy.orm import Session

from jose import JWTError, jwt

from database import get_db

from models import User

from config import (
    SECRET_KEY,
    ALGORITHM
)


oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/auth/login"
)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,

        detail="Token tidak valid",

        headers={
            "WWW-Authenticate": "Bearer"
        }
    )


    try:

        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )


        username = payload.get("sub")


        if username is None:

            raise credentials_exception


    except JWTError:

        raise credentials_exception


    user = (
        db.query(User)
        .filter(
            User.username == username
        )
        .first()
    )


    if user is None:

        raise credentials_exception


    if not user.is_active:

        raise HTTPException(
            status_code=400,
            detail="User tidak aktif"
        )


    return user

# ==========================================
# ROLE CHECKER
# ==========================================

def require_role(*allowed_roles):

    def role_checker(
        current_user: User = Depends(
            get_current_user
        )
    ):

        if current_user.role not in allowed_roles:

            raise HTTPException(
                status_code=403,
                detail="Tidak memiliki hak akses"
            )


        return current_user


    return role_checker