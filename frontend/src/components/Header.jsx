import { useAuth } from "../auth/AuthContext";
import { IconMenu, IconBell, IconChevronDown } from "./Icons";


function Header() {

  const {
    user
  } = useAuth();


  return (

    <header className="header">

      <div className="header-left">

        <button className="mobile-menu-button">
          <IconMenu size={20} />
        </button>

        <h2>
          Dashboard
        </h2>

      </div>


      <div className="header-right">

        <button
          className="notification-button"
          title="Notifikasi"
        >
          <IconBell size={17} />
        </button>


        <div className="header-user">

          <div className="header-avatar">
            {user?.full_name
              ?.charAt(0)
              ?.toUpperCase()}
          </div>


          <div className="header-user-info">

            <div className="header-user-name">
              {user?.full_name}
            </div>

            <div className="header-user-role">
              {user?.role}
            </div>

          </div>


          <span className="dropdown-icon">
            <IconChevronDown size={12} />
          </span>

        </div>

      </div>

    </header>

  );

}


export default Header;
