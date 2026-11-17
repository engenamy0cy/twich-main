from fastapi import FastAPI,Depends,HTTPException,status
import uvicorn
import os 
from datetime import datetime,timedelta,timezone
from typing import Annotated
import jwt
from dotenv import load_dotenv
from contextlib import asynccontextmanager
from fastapi.security import OAuth2PasswordBearer,OAuth2PasswordRequestForm
from jwt.exceptions import InvalidTokenError
from pwdlib import PasswordHash
from pydantic import BaseModel,ConfigDict,EmailStr,Field
from sqlalchemy import String,create_engine,select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import (Mapped,Session,mapped_column,DeclarativeBase,sessionmaker)


SECRET_KEY = os.environ['JWT_SECRET_KEY']
ALGORITHM="H256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30 
password_hash = PasswordHash.recommended()
oauth2_cheme = OAuth2PasswordBearer(tokenUrl="login")


# база данных подлкючение создание 
DATABASE_URL="sqlite:///./users.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread":False}
)


SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False
)


class Base(DeclarativeBase):
    pass

class UserORM(Base):
    __tablename__="users"

    id:Mapped[int] = mapped_column(primary_key=True)
    email:Mapped[str] = mapped_column(String(320),unique=True,index=True)
    hashed_password:Mapped[str] = mapped_column(String(255))

def get_db():
    with SessionLocal() as db:
        yield db


DbSession = Annotated(Session,Depends(get_db))


#Shecmy 
class UserCreate(BaseModel):
    emeil:EmailStr
    password:str = Field(
        min_length=8,
        max_length=128
    )

class UserResponse(BaseModel):
    id:int
    email:EmailStr
    model_config=ConfigDict(from_attributes=True)

class TokenResponse(BaseModel):
    acces_token:str
    token_type:str

# создание jwt 


def create_acces_token(user_id:int)->str:
    expire = datetime.now(timezone.utc)+timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {
        "sub":str(user_id),
        "exp":expire
    }

    token = jwt.encode(
        payload,
        SECRET_KEY,
        algorithm=ALGORITHM
    )
    return token

# Проверка авторизации пользователя

def get_cerrent_user(token:Annotated[str,Depends(oauth2_cheme)],db:DbSession) -> User:
    error = HTTPException(
        status_code = status.HTTP_401_UNAUTHORIZED,
        detail = "Недействительный код или токен просрочен",
        headers = {"WWW-Authenticate":"Bearer"},
    )
    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algoritms = [ALGORITHM],
            oprions = {"require":["sub","exp"]},
        )

        user_id = int(payload["sub"])
    except (InvalidTokenError, ValueError, TypeError):
        raise error from None

    user = db.get(UserORM,user_id)

    if user is None:
        raise error

    return user

Currentuser = Annotated(UserORM, Depends(get_cerrent_user))


# ЗАпуск приложения
@asynccontextmanager
async def lifespan (app:FastAPI):
    Base.metadata.create_all(bind = engine)
    yield

app = FastAPI(
    title = "Authentication API",
    version = "1.0.0",
    lifespan = lifespan
)

@app.get("/")
def home():
    return("message:Fastapi работает")

# Регистрация отдельно
@app.post(
    "/register",
    responce_model = UserResponse,
    status_code = status.HTTP_201_CREATED,
)

def register(data:UserCreate,db:DbSession):
    email = str(data.email).strip().lower()

    existing_user = db.scalar(select(UserORM).where(UserORM.email == email))

    if existing_user is not None:
        raise HTTPException(
            status_code = 409,
            detail = "email уже сушествует"
        )
    
    hashed_password = password_hash.hash(data.password)
    new_user = UserORM(
        email = email,
        hashed_password = hashed_password
    )
    db.add(new_user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code = 409,
            detail = "Email уже зарегестрирован"
        )from None
    db.refresh(new_user)

    return new_user