from sqlalchemy import create_engine, Column, Integer, String, DateTime, Text, JSON, ForeignKey, UniqueConstraint
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship
from sqlalchemy.sql import func
from typing import List, Optional, Dict, Any
import json
from datetime import datetime, timezone

# Database setup
SQLALCHEMY_DATABASE_URL = "sqlite:///./dalgolite.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Database Models
class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint('google_sub', name='uq_users_google_sub'),
    )

    id = Column(Integer, primary_key=True, index=True)
    google_sub = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, index=True)
    name = Column(String)
    picture_url = Column(String)
    login_count = Column(Integer, default=0)
    first_login_at = Column(DateTime, nullable=True)
    last_login_at = Column(DateTime, nullable=True)
    last_ip = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class ConnectedSheet(Base):
    __tablename__ = "connected_sheets"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    spreadsheet_id = Column(String, unique=True, index=True, nullable=False)
    spreadsheet_url = Column(String, nullable=False)
    sheet_name = Column(String, nullable=False)
    title = Column(String, nullable=False)
    connected_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_synced = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    total_rows = Column(Integer, default=0)
    columns = Column(JSON)  # Store column names as JSON array
    sample_data = Column(JSON)  # Store first few rows as JSON
    
    # Relationships
    user = relationship("User")
    charts = relationship("SavedChart", back_populates="sheet", cascade="all, delete-orphan")

class SavedChart(Base):
    __tablename__ = "saved_charts"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    sheet_id = Column(Integer, ForeignKey("connected_sheets.id"), nullable=True)  # Allow null for transformed datasets  
    project_id = Column(Integer, nullable=True)  # Charts from transformed data (FK added later)
    chart_name = Column(String, nullable=False)
    chart_type = Column(String, nullable=False)  # bar, line, pie, scatter, histogram
    x_axis_column = Column(String, nullable=True)
    y_axis_column = Column(String, nullable=True)
    chart_config = Column(JSON)  # Store chart.js configuration
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # Relationships
    user = relationship("User")
    sheet = relationship("ConnectedSheet", back_populates="charts")

class TransformationProject(Base):
    __tablename__ = "transformation_projects"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    mode = Column(String, default='simple')  # simple, advanced, expert
    sheet_ids = Column(JSON)  # Array of connected sheet IDs
    join_config = Column(JSON)  # Join specifications
    transformations = Column(JSON)  # List of transformation rules
    pipeline_status = Column(String, default='draft')  # draft, running, completed, failed
    last_pipeline_run = Column(DateTime)
    schedule_config = Column(JSON)  # Scheduling configuration
    warehouse_table_name = Column(String)  # Name of materialized table in warehouse
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Relationships will be added later after proper FK setup
    user = relationship("User")

class TransformedDataWarehouse(Base):
    __tablename__ = "transformed_data_warehouse"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("transformation_projects.id"), nullable=False)
    table_name = Column(String, nullable=False, unique=True)
    row_count = Column(Integer, default=0)
    column_schema = Column(JSON)  # Store column names and types
    data_hash = Column(String)  # Hash of the data for change detection
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    user = relationship("User")
    project = relationship("TransformationProject")

class DataTransformation(Base):
    __tablename__ = "data_transformations"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("transformation_projects.id"), nullable=False)
    sheet_id = Column(Integer, ForeignKey("connected_sheets.id"), nullable=False)
    column_name = Column(String, nullable=False)
    transformation_type = Column(String, nullable=False)  # lowercase, uppercase, date_format, null_replace, etc.
    parameters = Column(JSON)  # Transformation-specific configuration
    order_index = Column(Integer, default=0)  # Order of transformation execution
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    user = relationship("User")
    project = relationship("TransformationProject")
    sheet = relationship("ConnectedSheet")

class PipelineExecutionHistory(Base):
    __tablename__ = "pipeline_execution_history"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("transformation_projects.id"), nullable=False)
    status = Column(String, nullable=False)  # running, completed, failed
    started_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime, nullable=True)
    error_message = Column(String, nullable=True)
    sheets_synced = Column(Integer, default=0)
    total_sheets = Column(Integer, default=0)
    rows_processed = Column(Integer, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    
    # Relationships
    user = relationship("User")
    project = relationship("TransformationProject")

# Database migration utilities
def migrate_database():
    """Handle database schema migrations safely"""
    from sqlalchemy import inspect, text
    
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()

    # Ensure users table exists
    if 'users' not in existing_tables:
        with engine.connect() as conn:
            try:
                conn.execute(text("""
                    CREATE TABLE users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        google_sub TEXT NOT NULL UNIQUE,
                        email TEXT,
                        name TEXT,
                        picture_url TEXT,
                        login_count INTEGER DEFAULT 0,
                        first_login_at DATETIME,
                        last_login_at DATETIME,
                        last_ip TEXT,
                        created_at DATETIME,
                        updated_at DATETIME
                    )
                """))
                conn.commit()
            except Exception:
                # Fall back to metadata create_all
                pass
    
    # Check if we need to migrate SavedChart table
    if 'saved_charts' in existing_tables:
        existing_columns = [col['name'] for col in inspector.get_columns('saved_charts')]
        
        # Add project_id column if it doesn't exist
        if 'project_id' not in existing_columns:
            print("Adding project_id column to saved_charts table...")
            with engine.connect() as conn:
                # Add column without foreign key constraint first
                conn.execute(text("ALTER TABLE saved_charts ADD COLUMN project_id INTEGER"))
                conn.commit()
            print("Migration completed successfully")
    
    # Check if we need to migrate connected_sheets table to add user_id
    if 'connected_sheets' in existing_tables:
        existing_columns = [col['name'] for col in inspector.get_columns('connected_sheets')]
        
        if 'user_id' not in existing_columns:
            print("Adding user_id column to connected_sheets table...")
            with engine.connect() as conn:
                # First, add the column as nullable
                conn.execute(text("ALTER TABLE connected_sheets ADD COLUMN user_id INTEGER"))
                conn.commit()
                
                # Get the first user ID to assign to existing sheets (if any users exist)
                result = conn.execute(text("SELECT id FROM users LIMIT 1"))
                first_user = result.fetchone()
                
                if first_user:
                    # Assign all existing sheets to the first user
                    conn.execute(text(f"UPDATE connected_sheets SET user_id = {first_user[0]} WHERE user_id IS NULL"))
                    conn.commit()
                    print(f"Assigned existing sheets to user {first_user[0]}")
                else:
                    # If no users exist, we'll need to handle this case
                    print("WARNING: No users found. Existing sheets will have NULL user_id")
                
                # Make the column NOT NULL after assigning values
                # Note: SQLite doesn't support ALTER COLUMN, so we'll recreate the table
                print("Recreating connected_sheets table with NOT NULL constraint...")
                conn.execute(text("""
                    CREATE TABLE connected_sheets_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        spreadsheet_id TEXT NOT NULL UNIQUE,
                        spreadsheet_url TEXT NOT NULL,
                        sheet_name TEXT NOT NULL,
                        title TEXT NOT NULL,
                        connected_at DATETIME,
                        last_synced DATETIME,
                        total_rows INTEGER DEFAULT 0,
                        columns TEXT,
                        sample_data TEXT,
                        FOREIGN KEY (user_id) REFERENCES users(id)
                    )
                """))
                
                # Copy data from old table
                conn.execute(text("""
                    INSERT INTO connected_sheets_new 
                    SELECT id, user_id, spreadsheet_id, spreadsheet_url, sheet_name, title, 
                           connected_at, last_synced, total_rows, columns, sample_data
                    FROM connected_sheets
                """))
                
                # Drop old table and rename new one
                conn.execute(text("DROP TABLE connected_sheets"))
                conn.execute(text("ALTER TABLE connected_sheets_new RENAME TO connected_sheets"))
                conn.commit()
                print("Migration completed successfully")
    
    # Check if we need to migrate transformation_projects table
    if 'transformation_projects' in existing_tables:
        existing_columns = [col['name'] for col in inspector.get_columns('transformation_projects')]
        
        # Add pipeline columns if they don't exist
        new_columns = [
            ('pipeline_status', 'TEXT DEFAULT "draft"'),
            ('last_pipeline_run', 'DATETIME'),
            ('schedule_config', 'TEXT'),
            ('warehouse_table_name', 'TEXT')
        ]
        
        with engine.connect() as conn:
            for column_name, column_def in new_columns:
                if column_name not in existing_columns:
                    print(f"Adding {column_name} column to transformation_projects table...")
                    conn.execute(text(f"ALTER TABLE transformation_projects ADD COLUMN {column_name} {column_def}"))
                    conn.commit()
        
        # Check if we need to update column constraints for project charts
        print("Checking if saved_charts table needs constraint updates...")
        with engine.connect() as conn:
            # Check if we need to migrate the table to allow nullable sheet_id
            # We'll check if there are any project charts that would fail
            try:
                result = conn.execute(text("SELECT COUNT(*) FROM saved_charts WHERE sheet_id IS NULL"))
                null_sheet_count = result.fetchone()[0]
                
                if null_sheet_count == 0:
                    # Test if we can insert a null sheet_id
                    try:
                        test_insert = text("""
                            INSERT INTO saved_charts (sheet_id, project_id, chart_name, chart_type, x_axis_column, y_axis_column, chart_config, created_at, updated_at) 
                            VALUES (NULL, 999, 'test', 'bar', 'test_col', NULL, '{}', datetime('now'), datetime('now'))
                        """)
                        conn.execute(test_insert)
                        # If successful, remove the test record
                        conn.execute(text("DELETE FROM saved_charts WHERE project_id = 999 AND chart_name = 'test'"))
                        conn.commit()
                        print("Table already supports nullable sheet_id")
                    except Exception as e:
                        if "NOT NULL constraint failed: saved_charts.sheet_id" in str(e):
                            print("Need to migrate saved_charts table to support nullable sheet_id...")
                            # Recreate table with proper constraints
                            conn.execute(text("ALTER TABLE saved_charts RENAME TO saved_charts_old"))
                            conn.execute(text("""
                                CREATE TABLE saved_charts (
                                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                                    sheet_id INTEGER,
                                    project_id INTEGER,
                                    chart_name TEXT NOT NULL,
                                    chart_type TEXT NOT NULL,
                                    x_axis_column TEXT,
                                    y_axis_column TEXT,
                                    chart_config TEXT,
                                    created_at DATETIME,
                                    updated_at DATETIME,
                                    FOREIGN KEY (sheet_id) REFERENCES connected_sheets(id)
                                )
                            """))
                            conn.execute(text("""
                                INSERT INTO saved_charts 
                                SELECT * FROM saved_charts_old
                            """))
                            conn.execute(text("DROP TABLE saved_charts_old"))
                            conn.commit()
                            print("Table migration completed successfully")
                        else:
                            raise
            except Exception as e:
                print(f"Migration check failed: {e}")
                # If anything goes wrong, continue without migration
                pass
    
    # Create any new tables
    Base.metadata.create_all(bind=engine)

# Create tables with migration
def create_tables():
    migrate_database()

# Dependency to get database session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Database operations
class SheetRepository:
    def __init__(self, db: Session):
        self.db = db
    
    def create_or_update_sheet(self, user_id: int, spreadsheet_id: str, spreadsheet_url: str, 
                              sheet_name: str, title: str, columns: List[str], 
                              sample_data: List[List[str]], total_rows: int) -> ConnectedSheet:
        # Check if sheet already exists
        existing_sheet = self.db.query(ConnectedSheet).filter(
            ConnectedSheet.spreadsheet_id == spreadsheet_id
        ).first()
        
        if existing_sheet:
            # Update existing sheet
            existing_sheet.user_id = user_id  # Update user_id in case it changed
            existing_sheet.sheet_name = sheet_name
            existing_sheet.title = title
            existing_sheet.columns = columns
            existing_sheet.sample_data = sample_data
            existing_sheet.total_rows = total_rows
            existing_sheet.last_synced = datetime.now(timezone.utc)
            self.db.commit()
            self.db.refresh(existing_sheet)
            return existing_sheet
        else:
            # Create new sheet
            new_sheet = ConnectedSheet(
                user_id=user_id,
                spreadsheet_id=spreadsheet_id,
                spreadsheet_url=spreadsheet_url,
                sheet_name=sheet_name,
                title=title,
                columns=columns,
                sample_data=sample_data,
                total_rows=total_rows
            )
            self.db.add(new_sheet)
            self.db.commit()
            self.db.refresh(new_sheet)
            return new_sheet
    
    def get_all_sheets(self) -> List[ConnectedSheet]:
        return self.db.query(ConnectedSheet).order_by(ConnectedSheet.connected_at.desc()).all()
    
    def get_sheets_by_user(self, user_id: int) -> List[ConnectedSheet]:
        return self.db.query(ConnectedSheet).filter(
            ConnectedSheet.user_id == user_id
        ).order_by(ConnectedSheet.connected_at.desc()).all()
    
    def get_sheet_by_id(self, sheet_id: int) -> Optional[ConnectedSheet]:
        return self.db.query(ConnectedSheet).filter(ConnectedSheet.id == sheet_id).first()
    
    def get_sheet_by_id_and_user(self, sheet_id: int, user_id: int) -> Optional[ConnectedSheet]:
        return self.db.query(ConnectedSheet).filter(
            ConnectedSheet.id == sheet_id,
            ConnectedSheet.user_id == user_id
        ).first()
    
    def get_sheet_by_spreadsheet_id(self, spreadsheet_id: str) -> Optional[ConnectedSheet]:
        return self.db.query(ConnectedSheet).filter(
            ConnectedSheet.spreadsheet_id == spreadsheet_id
        ).first()
    
    def delete_sheet(self, sheet_id: int) -> bool:
        sheet = self.get_sheet_by_id(sheet_id)
        if sheet:
            self.db.delete(sheet)
            self.db.commit()
            return True
        return False

class ChartRepository:
    def __init__(self, db: Session):
        self.db = db
    
    def create_chart(self, sheet_id: int, chart_name: str, chart_type: str,
                    x_axis_column: str, y_axis_column: str, chart_config: Dict[str, Any]) -> SavedChart:
        new_chart = SavedChart(
            sheet_id=sheet_id,
            chart_name=chart_name,
            chart_type=chart_type,
            x_axis_column=x_axis_column,
            y_axis_column=y_axis_column,
            chart_config=chart_config
        )
        self.db.add(new_chart)
        self.db.commit()
        self.db.refresh(new_chart)
        return new_chart
    
    def get_charts_by_sheet(self, sheet_id: int) -> List[SavedChart]:
        return self.db.query(SavedChart).filter(SavedChart.sheet_id == sheet_id).order_by(SavedChart.created_at.desc()).all()
    
    def get_chart_by_id(self, chart_id: int) -> Optional[SavedChart]:
        return self.db.query(SavedChart).filter(SavedChart.id == chart_id).first()
    
    def update_chart(self, chart_id: int, chart_name: str = None, chart_type: str = None,
                    x_axis_column: str = None, y_axis_column: str = None, 
                    chart_config: Dict[str, Any] = None) -> Optional[SavedChart]:
        chart = self.get_chart_by_id(chart_id)
        if chart:
            if chart_name is not None:
                chart.chart_name = chart_name
            if chart_type is not None:
                chart.chart_type = chart_type
            if x_axis_column is not None:
                chart.x_axis_column = x_axis_column
            if y_axis_column is not None:
                chart.y_axis_column = y_axis_column
            if chart_config is not None:
                chart.chart_config = chart_config
            
            chart.updated_at = func.now()
            self.db.commit()
            self.db.refresh(chart)
            return chart
        return None
    
    def delete_chart(self, chart_id: int) -> bool:
        chart = self.get_chart_by_id(chart_id)
        if chart:
            self.db.delete(chart)
            self.db.commit()
            return True
        return False

class TransformationProjectRepository:
    def __init__(self, db: Session):
        self.db = db
    
    def create_project(self, name: str, description: str, sheet_ids: List[int], mode: str = 'simple') -> TransformationProject:
        project = TransformationProject(
            name=name,
            description=description,
            sheet_ids=sheet_ids,
            mode=mode,
            join_config={},
            transformations=[]
        )
        self.db.add(project)
        self.db.commit()
        self.db.refresh(project)
        return project
    
    def get_all_projects(self) -> List[TransformationProject]:
        return self.db.query(TransformationProject).order_by(TransformationProject.created_at.desc()).all()
    
    def get_project_by_id(self, project_id: int) -> Optional[TransformationProject]:
        return self.db.query(TransformationProject).filter(TransformationProject.id == project_id).first()
    
    def update_project(self, project_id: int, **kwargs) -> Optional[TransformationProject]:
        project = self.get_project_by_id(project_id)
        if project:
            for key, value in kwargs.items():
                if hasattr(project, key) and value is not None:
                    setattr(project, key, value)
            project.updated_at = datetime.now(timezone.utc)
            self.db.commit()
            self.db.refresh(project)
            return project
        return None
    
    def delete_project(self, project_id: int) -> bool:
        project = self.get_project_by_id(project_id)
        if project:
            self.db.delete(project)
            self.db.commit()
            return True
        return False

class UserRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_sub(self, google_sub: str) -> Optional[User]:
        return self.db.query(User).filter(User.google_sub == google_sub).first()

    def get_by_email(self, email: str) -> Optional[User]:
        return self.db.query(User).filter(User.email == email).first()

    def increment_login(self, google_sub: str, email: Optional[str] = None, name: Optional[str] = None,
                         picture_url: Optional[str] = None, last_ip: Optional[str] = None) -> User:
        user = self.get_by_sub(google_sub)
        now = datetime.now(timezone.utc)
        if user is None:
            user = User(
                google_sub=google_sub,
                email=email,
                name=name,
                picture_url=picture_url,
                login_count=1,
                first_login_at=now,
                last_login_at=now,
                last_ip=last_ip,
                created_at=now,
                updated_at=now,
            )
            self.db.add(user)
            self.db.commit()
            self.db.refresh(user)
            return user

        # Update existing user
        user.login_count = (user.login_count or 0) + 1
        user.last_login_at = now
        user.updated_at = now
        if email:
            user.email = email
        if name:
            user.name = name
        if picture_url:
            user.picture_url = picture_url
        if last_ip:
            user.last_ip = last_ip
        self.db.commit()
        self.db.refresh(user)
        return user